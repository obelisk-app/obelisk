/**
 * One-shot reads: in-flight dedupe plus a byte-bounded result cache.
 *
 * Key: `${identityId}|${sortedRelays}|${canonicalFilters}`. The identity is
 * part of the key because a query result can be per-recipient (kind 1059
 * wraps addressed to one pubkey); public data simply lands under the
 * session identity (DECISIONS §1). Concurrent identical queries share one
 * REQ and one promise. A settled result is cached for `ttlMs` (60 s) when
 * every relay said EOSE, or 10 s when the answer was uncertain, so a
 * flapping relay is not hammered but a real answer is retried soon.
 *
 * Cache memory: FIFO (uniform TTL per class means insertion order equals
 * expiry order), 256 entries and 2 MB measured by `JSON.stringify(ev).length`
 * per event. Entries are variable-size (a 200-event history vs a 1-event
 * lookup), so the byte budget is what bounds memory; the count cap bounds
 * bookkeeping: 256 × (key ~200 B + record 56 B + Map 40 B) ≈ 76 KB.
 *
 * Never shares a REQ with a live `subscribe`: CLOSE-on-EOSE vs keep-open.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import type { HubEnv, Identity, QueryRelayOutcome, QueryResult, QuerySpec, SubscriptionLike } from './types';
import type { SocketEntry, SocketTable } from './sockets';
import { BoundedMap } from './bounded-map';
import { normalizeURL, queryKey } from './canonical';
import { SYNTHETIC_EOSE_MARGIN_MS } from './env';

export interface QueryOptions {
  readonly maxEntries: number;        // 256
  readonly maxBytes: number;          // 2 MB
  readonly ttlMs: number;             // 60_000
  readonly incompleteTtlMs: number;   // 10_000
  readonly defaultMaxWaitMs: number;  // 4000
}

export const DEFAULT_QUERY_OPTIONS: QueryOptions = {
  maxEntries: 256,
  maxBytes: 2 * 1024 * 1024,
  ttlMs: 60_000,
  incompleteTtlMs: 10_000,
  defaultMaxWaitMs: 4000,
};

export function resultBytes(result: QueryResult): number {
  let total = 0;
  for (const ev of result.events) total += JSON.stringify(ev).length;
  return total;
}

export class QueryPath {
  private readonly inflight = new Map<string, Promise<QueryResult>>();
  readonly cache: BoundedMap<string, QueryResult>;

  constructor(
    private readonly sockets: SocketTable,
    env: HubEnv,
    private readonly opts: QueryOptions,
  ) {
    this.cache = new BoundedMap<string, QueryResult>({
      maxEntries: opts.maxEntries,
      maxBytes: opts.maxBytes,
      policy: 'fifo',
      sizeOf: resultBytes,
      ttlMs: opts.ttlMs,
      now: env.now,
    });
  }

  query(spec: QuerySpec, identity: Identity): Promise<QueryResult> {
    const key = queryKey(identity.id, spec.relays, spec.filters);
    const mode = spec.cache?.mode ?? 'cached-ok';
    if (mode === 'cached-ok') {
      const hit = this.cache.get(key);
      if (hit) return Promise.resolve({ ...hit, fromCache: true });
    }
    const running = this.inflight.get(key);
    if (running) return running;
    // `run` never rejects, so one `then` both records the result and clears
    // the in-flight slot: a query settles one microtask after its last EOSE.
    const promise = this.run(spec, identity).then((result) => {
      if (this.inflight.get(key) === promise) this.inflight.delete(key);
      if (mode !== 'bypass') {
        const ttl = result.complete ? spec.cache?.ttlMs ?? this.opts.ttlMs : this.opts.incompleteTtlMs;
        this.cache.set(key, result, { ttlMs: ttl });
      }
      return result;
    });
    this.inflight.set(key, promise);
    return promise;
  }

  /** Drop cached results that belong to an identity (its private data goes with it). */
  clearIdentity(identityId: string): void {
    const prefix = identityId + '|';
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key);
  }

  get inflightCount(): number {
    return this.inflight.size;
  }

  private run(spec: QuerySpec, identity: Identity): Promise<QueryResult> {
    return new Promise<QueryResult>((resolve) => {
      const maxWait = spec.maxWaitMs ?? this.opts.defaultMaxWaitMs;
      const urls = Array.from(new Set(spec.relays.map(normalizeURL)));
      const filters = spec.filters.map((f) => ({ ...f }));
      const perRelay: Record<string, QueryRelayOutcome> = {};
      const events: NostrEvent[] = [];
      const seen = new Set<string>();
      const subs: SubscriptionLike[] = [];
      const busy: SocketEntry[] = [];
      let remaining = urls.length;
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(deadline);
        for (const url of urls) if (!perRelay[url]) perRelay[url] = 'timeout';
        for (const sub of subs) {
          try {
            sub.close();
          } catch {
            // closed socket
          }
        }
        for (const entry of busy) entry.busy = Math.max(0, entry.busy - 1);
        resolve({
          events,
          complete: urls.every((u) => perRelay[u] === 'eose'),
          fromCache: false,
          perRelay,
        });
      };
      const deadline = setTimeout(finish, maxWait);
      const settle = (url: string, outcome: QueryRelayOutcome) => {
        if (perRelay[url]) return;
        perRelay[url] = outcome;
        remaining -= 1;
        if (remaining === 0) finish();
      };

      for (const url of urls) {
        let entry: SocketEntry;
        try {
          entry = this.sockets.ensure(url, identity);
        } catch {
          settle(url, 'unreachable');
          continue;
        }
        entry.busy += 1;
        busy.push(entry);
        // A socket that is already up gets its REQ in this tick, as the
        // registry issues a live sub; only a socket still handshaking waits.
        const issue = () => {
            if (done) return;
            const ref: { sub: SubscriptionLike | null } = { sub: null };
            let closingOurselves = false;
            ref.sub = entry.relay.subscribe(filters, {
              onevent: (ev) => {
                if (done || seen.has(ev.id)) return;
                seen.add(ev.id);
                events.push(ev);
              },
              // nostr-tools fires a synthetic EOSE just before `onclose` for
              // a relay-sent CLOSED, in the same tick. One microtask lets
              // that CLOSED land first, so a refused REQ settles `closed`
              // (uncertain) rather than `eose` (an authoritative empty).
              oneose: () => {
                queueMicrotask(() => {
                  if (done || perRelay[url]) return;
                  closingOurselves = true;
                  settle(url, 'eose');
                  try {
                    ref.sub?.close();
                  } catch {
                    // closed socket
                  }
                });
              },
              onclose: () => {
                if (!closingOurselves) settle(url, 'closed');
              },
              // Behind the deadline, so only a relay EOSE can prove empty.
              eoseTimeout: maxWait + SYNTHETIC_EOSE_MARGIN_MS,
              label: spec.label ?? 'hub-query',
            });
            subs.push(ref.sub);
        };
        if (entry.connection === 'connected') issue();
        else this.sockets.whenConnected(entry, maxWait).then(issue, () => settle(url, 'unreachable'));
      }
      if (urls.length === 0) finish();
    });
  }
}
