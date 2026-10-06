/**
 * The `SimplePool`-shaped facade. A later step does
 * `setPool(hub.poolLike())` so `@nostr-wot/data` reads ride the hub's
 * sockets, dedupe, budget and AUTH policy without knowing. Semantics match
 * nostr-tools: `oneose` fires once when every relay has answered, `onclose`
 * once with one reason per relay, and an event id is delivered once across
 * relays. It always acts as the `'session'` identity.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { PoolLike, PoolSubscribeParams, RelayHub, RelayLike, SubCloser, SubscriptionHandle } from './types';
import { SESSION_IDENTITY_ID } from './types';
import { BoundedSet } from './bounded-map';
import { normalizeURL } from './canonical';
import { errorMessage } from './env';

export interface HubInternals extends RelayHub {
  relayFor(url: string, identityId: string, timeoutMs?: number): Promise<RelayLike>;
  connectedUrls(identityId: string): Map<string, boolean>;
}

/**
 * Event ids already delivered across the relays of one facade subscription,
 * FIFO. 2,000 x (80 B id + 40 B Set entry) is about 240 KB per live facade
 * sub at the worst case; it lives and dies with the `SubCloser`.
 */
const CROSS_RELAY_SEEN = 2000;

/** Distinct relays in call order; a URL that does not normalize is kept verbatim so the hub can report it. */
function dedupeRelays(relays: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of relays) {
    let url = raw;
    try {
      url = normalizeURL(raw);
    } catch {
      // Reported per relay by `hub.publish`.
    }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function createPoolLike(hub: HubInternals): PoolLike {
  const subscribeMap = (
    requests: { url: string; filter: Filter }[],
    params: PoolSubscribeParams,
    closeOnEose: boolean,
  ): SubCloser => {
    const grouped = new Map<string, Filter[]>();
    for (const req of requests) {
      const url = normalizeURL(req.url);
      const list = grouped.get(url) ?? [];
      list.push(req.filter);
      grouped.set(url, list);
    }
    const urls = Array.from(grouped.keys());
    const seen = new BoundedSet<string>(CROSS_RELAY_SEEN);
    const handles = new Map<string, SubscriptionHandle>();
    const reasons: string[] = new Array(urls.length).fill('');
    const eosed = new Set<string>();
    const closed = new Set<string>();
    let eoseFired = false;
    let closeFired = false;

    const maybeEose = () => {
      if (eoseFired) return;
      if (urls.every((u) => eosed.has(u) || closed.has(u))) {
        eoseFired = true;
        params.oneose?.();
      }
    };
    const markClosed = (url: string, reason: string) => {
      if (closed.has(url)) return;
      closed.add(url);
      reasons[urls.indexOf(url)] = reason;
      maybeEose();
      if (!closeFired && closed.size === urls.length) {
        closeFired = true;
        params.onclose?.(reasons.slice());
      }
    };

    for (const url of urls) {
      const filters = grouped.get(url) ?? [];
      try {
        const handle = hub.subscribe({
          relays: [url],
          filters,
          identityId: SESSION_IDENTITY_ID,
          priority: 'background',
          label: params.label,
          onEvent: (ev) => {
            if (params.alreadyHaveEvent?.(ev.id)) return;
            if (!seen.add(ev.id)) return;
            params.onevent?.(ev);
          },
          onEose: () => {
            if (eosed.has(url)) return;
            eosed.add(url);
            maybeEose();
            if (closeOnEose) {
              handles.get(url)?.release();
              markClosed(url, 'closed by caller');
            }
          },
          onClosed: (_relay, reason) => markClosed(url, reason),
        });
        handles.set(url, handle);
      } catch (err) {
        const reason = errorMessage(err);
        queueMicrotask(() => markClosed(url, reason));
      }
    }
    return {
      close: (reason = 'closed by caller') => {
        for (const [url, handle] of handles) {
          handle.release();
          markClosed(url, reason);
        }
      },
    };
  };

  const subscribe = (relays: string[], filter: Filter, params: PoolSubscribeParams): SubCloser =>
    subscribeMap(relays.map((url) => ({ url, filter })), params, false);

  return {
    ensureRelay: (url, params) => hub.relayFor(url, SESSION_IDENTITY_ID, params?.connectionTimeout),
    subscribe,
    subscribeMany: subscribe,
    subscribeManyEose: (relays, filter, params) => subscribeMap(relays.map((url) => ({ url, filter })), params, true),
    subscribeMap: (requests, params) => subscribeMap(requests, params, false),
    querySync: async (relays, filter, params) => {
      const result = await hub.query({ relays, filters: [filter], maxWaitMs: params?.maxWait });
      return result.events.slice();
    },
    get: async (relays, filter, params) => {
      const result = await hub.query({ relays, filters: [{ ...filter, limit: 1 }], maxWaitMs: params?.maxWait });
      const sorted = result.events.slice().sort((a, b) => b.created_at - a.created_at);
      return sorted[0] ?? null;
    },
    publish: (relays: string[], event: NostrEvent) =>
      // One promise per distinct relay, like `SimplePool.publish`. An invalid
      // URL rejects its own promise (the hub reports it `unreachable`) rather
      // than throwing out of the call and losing the other relays' promises.
      dedupeRelays(relays).map(async (url) => {
        const [result] = await hub.publish({ relays: [url], event });
        if (!result || result.status === 'ok') return result?.reason ?? '';
        throw new Error(result.reason ?? result.status);
      }),
    close: (relays) => {
      for (const url of relays) hub.disconnect(url, { identityId: SESSION_IDENTITY_ID });
    },
    listConnectionStatus: () => hub.connectedUrls(SESSION_IDENTITY_ID),
    destroy: () => undefined,
  };
}
