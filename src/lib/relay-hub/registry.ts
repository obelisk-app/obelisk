/**
 * Refcounted, filter-keyed live subscription registry (requirement (c)).
 *
 * One `LiveSub` per `(socket, canonicalFilters)`. Two callers with
 * equivalent filters on one relay share one REQ; the REQ closes when the
 * last holder releases. Live REQs are deduped, never merged: a relay CLOSED
 * closes the whole REQ, and `limit` applies per filter, so merging two
 * callers' filters would change the semantics for both (the SDK's
 * `QueryBatcher` drops `limit` when it merges; that is the bug not to repeat).
 *
 * Transport drops are healed here: on the next socket generation every
 * sub is re-issued in priority order (`voice > active > dm > background`,
 * FIFO inside a class) with `since = lastEventAt + 1` on filters that had no
 * `until`. A REQ's priority is the highest among its holders and a holder
 * can change its own (`SubscriptionHandle.setPriority`).
 *
 * Silence is healed here too (migration step 7, the bridge's
 * `subscribeWatched` supervisor): a sub with `watchdogMs` that gets neither
 * EVENT nor EOSE in that window is closed and re-issued with backoff, unless
 * the socket's AUTH prompt is in flight, in which case it waits. The
 * watchdog and every retried CLOSED count against `maxAttempts`; past it the
 * sub is terminated so a later identical subscribe starts fresh.
 *
 * Relay verdicts are interpreted here. Every CLOSED is first reported
 * through `onRelayClosed` (a holder that releases there ends the hub's
 * involvement), then: `restricted:` is terminal at once; `auth-required:`,
 * and nostr-tools' "auth was required and attempted, but failed with: ..."
 * wrapper, are retried immediately once, then with backoff while the socket
 * can AUTH; quota / rate-limit reasons park the sub and lower the socket's
 * REQ budget for 60 s; anything else retries three times with backoff then
 * gives up. `onClosed` fires only when terminal.
 *
 * Per-socket budget: `max` REQ slots (default 40). When full, the lowest
 * priority open sub is parked to admit a higher one; otherwise the new sub
 * parks. A freed slot reopens the highest parked sub.
 *
 * This file owns who holds which REQ and the socket lifecycle hooks; the
 * per-REQ record lives in `live-sub.ts`, the wire machinery (issue, park,
 * watchdog, CLOSED verdicts, budget) in `sub-scheduler.ts`, and the CLOSED
 * reason classifier in `closed-reason.ts`.
 */
import type { Identity, SubscribeSpec, SubscriptionHandle } from './types';
import type { SocketEntry, SocketTable } from './sockets';
import type { AuthLayer } from './auth';
import { normalizeURL, subKey } from './canonical';
import {
  adoptHolderSettings,
  clearRetry,
  clearWatchdog,
  closeWire,
  createLiveSub,
  byPriority,
  recomputePriority,
  setStatus,
  type Holder,
  type LiveSub,
} from './live-sub';
import { SubScheduler, type RegistryOptions } from './sub-scheduler';

export { SEEN_IDS_PER_SUB } from './live-sub';
export type { LiveSub } from './live-sub';
export type { RegistryOptions } from './sub-scheduler';
export { classifyClosedReason, isQuotaReason } from './closed-reason';

export class SubscriptionRegistry {
  private readonly scheduler: SubScheduler;
  private seq = 0;

  constructor(
    private readonly sockets: SocketTable,
    auth: AuthLayer,
    private readonly opts: RegistryOptions,
  ) {
    this.scheduler = new SubScheduler(auth, opts);
  }

  subscribe(spec: SubscribeSpec, identity: Identity): SubscriptionHandle {
    if (spec.filters.length === 0) throw new Error('subscribe: at least one filter is required');
    const holder: Holder = { spec, priority: spec.priority ?? 'background' };
    const filters = spec.filters.map((f) => ({ ...f }));
    const urls = Array.from(new Set(spec.relays.map(normalizeURL)));
    const lives: LiveSub[] = [];
    let shared = false;
    try {
      for (const url of urls) {
        const entry = this.sockets.ensure(url, identity);
        const key = subKey(entry.url, filters);
        const bucket = this.scheduler.bucket(entry);
        let live = bucket.subs.get(key);
        if (live) {
          shared = true;
        } else {
          live = createLiveSub(key, entry, filters, holder.priority, ++this.seq);
          bucket.subs.set(key, live);
          entry.subs += 1;
        }
        live.holders.add(holder);
        adoptHolderSettings(live, holder);
        lives.push(live);
      }
    } catch (err) {
      for (const live of lives) this.detach(live, holder);
      throw err;
    }
    for (const live of lives) {
      if (live.terminalReason !== null) {
        spec.onStatus?.('closed', live.url);
        spec.onClosed?.(live.url, live.terminalReason);
        continue;
      }
      if (!live.issued && !live.retryTimer) this.scheduler.tryIssue(live);
      spec.onStatus?.(live.status, live.url);
    }
    let released = false;
    return {
      keys: lives.map((l) => l.key),
      shared,
      release: () => {
        if (released) return;
        released = true;
        for (const live of lives) this.detach(live, holder);
      },
      setPriority: (priority) => {
        if (released || holder.priority === priority) return;
        holder.priority = priority;
        for (const live of lives) recomputePriority(live);
      },
    };
  }

  // ---- socket lifecycle ---------------------------------------------------------

  onSocketOpen(entry: SocketEntry): void {
    const bucket = this.scheduler.buckets.get(entry.key);
    if (!bucket) return;
    const ordered = Array.from(bucket.subs.values()).sort(byPriority);
    for (const live of ordered) {
      if (live.terminalReason !== null) continue;
      live.attempt = 0;
      clearRetry(live);
      this.scheduler.tryIssue(live);
    }
  }

  /** Runs before nostr-tools fires the subscriptions' own `onclose`, so those are recognised as stale. */
  onSocketDrop(entry: SocketEntry): void {
    const bucket = this.scheduler.buckets.get(entry.key);
    if (!bucket) return;
    for (const live of bucket.subs.values()) {
      live.issued = null;
      clearRetry(live);
      clearWatchdog(live);
      if (live.terminalReason === null) setStatus(live, 'pending');
    }
  }

  onSocketForget(entry: SocketEntry): void {
    const bucket = this.scheduler.buckets.get(entry.key);
    if (!bucket) return;
    for (const live of Array.from(bucket.subs.values())) this.scheduler.terminate(live, 'socket closed');
    this.scheduler.forget(entry.key);
  }

  removeIdentity(identityId: string): void {
    for (const entry of this.sockets.forIdentity(identityId)) {
      const bucket = this.scheduler.buckets.get(entry.key);
      if (!bucket) continue;
      for (const live of Array.from(bucket.subs.values())) this.scheduler.terminate(live, 'identity removed');
    }
  }

  budgetFor(entry: SocketEntry): { used: number; max: number; parked: number } {
    const bucket = this.scheduler.buckets.get(entry.key);
    if (!bucket) return { used: 0, max: this.opts.maxSubsPerSocket, parked: 0 };
    let used = 0;
    let parked = 0;
    for (const live of bucket.subs.values()) {
      if (live.issued) used += 1;
      else if (live.status === 'parked') parked += 1;
    }
    return { used, max: bucket.max, parked };
  }

  openCount(entry: SocketEntry): number {
    return this.budgetFor(entry).used;
  }

  dispose(): void {
    for (const [key, bucket] of Array.from(this.scheduler.buckets.entries())) {
      for (const live of Array.from(bucket.subs.values())) this.scheduler.terminate(live, 'hub disposed');
      this.scheduler.forget(key);
    }
  }

  // ---- internals ----------------------------------------------------------------

  private detach(live: LiveSub, holder: Holder): void {
    if (!live.holders.delete(holder)) return;
    if (live.holders.size > 0) {
      recomputePriority(live);
      return;
    }
    const bucket = this.scheduler.buckets.get(live.entry.key);
    clearRetry(live);
    clearWatchdog(live);
    closeWire(live);
    bucket?.subs.delete(live.key);
    live.entry.subs = Math.max(0, live.entry.subs - 1);
    live.status = 'closed';
    if (bucket) this.scheduler.unparkOne(bucket);
  }
}
