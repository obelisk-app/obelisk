/**
 * Every REQ the session holds (round 4 plan, the hub-bound half of the
 * facade): the tracked list a session or relay reset releases, the REQs
 * pinned to a caller-named relay that a switch leaves alone, the one-shot
 * query, and the subscribe entry points the voice, SFU, games and
 * read-state layers call. The hub's registry owns the wire; a holder here
 * is a refcount on its filter. Pure move from `client.ts`.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { queryAuthorsBatched, type RelayHub } from '@/lib/relay-hub';
import type { WatchHold, WatchStreamCallbacks } from '../relay/background-watch';
import type { QueryOpts, TrackedSub, WatchedSubOptions } from '../facade/context';
import { uniqueRelayUrls } from '../relay/relay-list';
import type { StateStore } from '../common/state-store';
import { PinnedRequests } from './pinned';
import { openWatchedReq, type WatchedReqDeps } from './watched';

export { RELAY_SWITCH_GRACE_MS } from '@/constants/nostr-bridge/subscriptions';

export interface RequestsDeps {
  readonly hub: Pick<RelayHub, 'subscribe' | 'query' | 'acquireAuthLease' | 'disconnect'>;
  /** The active relay list, read live. */
  relays(): string[];
  readonly watched: WatchedReqDeps;
  readonly connectionState: StateStore<string>;
  /** True once the bridge has seen an active-relay socket up and not yet seen it drop. */
  activeSocketUp(): boolean;
}

export class RequestsModule {
  /**
   * Every REQ the session holds on the hub, so a session or relay reset can
   * release them all. The registry owns the wire; a holder here is a
   * refcount on its filter.
   */
  private subs: TrackedSub[] = [];
  /** REQs pinned to a caller-named relay, which a relay switch leaves alone (`./pinned.ts`). */
  readonly pinned: PinnedRequests;

  constructor(private readonly deps: RequestsDeps) {
    this.pinned = new PinnedRequests({
      hub: deps.hub,
      relays: () => deps.relays(),
      subscribeWatched: (relays, filter, onevent, oneose, options) => this.subscribeWatched(relays, filter, onevent, oneose, options),
    });
  }

  /** Register a REQ so a session or relay reset closes it. */
  track(...subs: TrackedSub[]): void {
    this.subs.push(...subs);
  }

  /** Forget a REQ without closing it (the relay already did). */
  untrack(sub: TrackedSub): void {
    this.subs = this.subs.filter((s) => s !== sub);
  }

  /** Release every tracked REQ (the registry CLOSEs the ones nobody else holds). */
  closeAll(): void {
    this.subs.forEach((s) => s.close());
    this.subs = [];
  }

  /** See `openWatchedReq` (`./watched.ts`). */
  subscribeWatched(
    relays: string[],
    filter: Filter,
    onevent: (ev: NostrEvent) => void,
    oneose?: () => void,
    options?: WatchedSubOptions,
  ): TrackedSub {
    return openWatchedReq(this.deps.watched, relays, filter, onevent, oneose, options);
  }

  /**
   * One bounded REQ per relay through the hub's query path, settled on
   * EOSE-from-all or `maxWait`. `complete` is true only when every relay
   * answered EOSE: a CLOSED, a timeout or an unreachable socket leaves the
   * answer uncertain, exactly as the bridge's own query used to report it.
   *
   * Cached by default: an identical read (same relays, same filter) inside
   * the hub's TTL is answered from memory with no REQ, and identical reads
   * in flight share one REQ. A caller that must see the wire passes
   * `opts.cache` and says why at its call site.
   */
  async queryRelaysWithConfidence(
    relays: readonly string[],
    filter: Filter,
    maxWait: number,
    opts?: QueryOpts,
  ): Promise<{ events: NostrEvent[]; complete: boolean }> {
    const targets = uniqueRelayUrls(Array.from(relays));
    if (targets.length === 0) return { events: [], complete: false };
    const result = await this.deps.hub.query({
      relays: targets,
      filters: [filter],
      maxWaitMs: maxWait,
      label: 'obelisk-query',
      cache: { mode: opts?.cache ?? 'cached-ok' },
    });
    return { events: Array.from(result.events), complete: result.complete };
  }

  /**
   * Per-author reads (`{kinds, authors, limit}` each) as one bounded REQ per
   * relay: the hub's author batching merges them (authors unioned, limits
   * summed, chunked at 100 authors) and hands each filter back only its own
   * events. `complete` as in {@link queryRelaysWithConfidence}.
   */
  async queryAuthorsWithConfidence(
    relays: readonly string[],
    filters: readonly Filter[],
    maxWait: number,
    opts?: QueryOpts,
  ): Promise<{ perFilter: NostrEvent[][]; complete: boolean }> {
    const targets = uniqueRelayUrls(Array.from(relays));
    if (targets.length === 0 || filters.length === 0) return { perFilter: filters.map(() => []), complete: false };
    const { result, perFilter } = await queryAuthorsBatched(this.deps.hub, {
      relays: targets,
      filters,
      maxWaitMs: maxWait,
      label: 'obelisk-query',
      cache: { mode: opts?.cache ?? 'cached-ok' },
    });
    return { perFilter: perFilter.map((events) => Array.from(events)), complete: result.complete };
  }

  /**
   * Subscribe to events on the configured relays matching `filter`. Returns
   * an unsubscribe function. NIP-42 auth is handled by the same signer the
   * rest of the pool uses. Used by voice for presence beacons and incoming
   * gift wraps. Filters apply per-relay; standard nostr-tools semantics.
   */
  subscribeFilter(filter: Filter, onEvent: (ev: NostrEvent) => void): () => void {
    const handle = this.deps.hub.subscribe({
      relays: this.deps.relays(),
      filters: [filter],
      onEvent: (ev) => onEvent(ev),
    });
    return () => handle.release();
  }

  /**
   * A background-watch REQ (`pings.ts`): straight onto the registry, no
   * access reporting (the watched relay's verdicts are not the banner's) and
   * no WoT gate (the ping path checks mutes itself, as it always did). The
   * watchdog matches the session REQs': a REQ a NIP-42 race swallowed on a
   * fresh socket is re-issued rather than left dead. Not in `subs`: a
   * relay switch is exactly when the watch must survive.
   */
  subscribeWatch(relay: string, filter: Filter, cb: WatchStreamCallbacks): WatchHold {
    const handle = this.deps.hub.subscribe({
      relays: [relay],
      filters: [filter],
      priority: 'background',
      watchdogMs: 5000,
      label: 'obelisk-watch',
      onEvent: (ev) => cb.onEvent(ev),
      onClosed: (_url, reason) => cb.onClosed(reason),
    });
    return { release: () => handle.release() };
  }

  subscribeFilterWatched(
    filter: Filter,
    onEvent: (ev: NostrEvent) => void,
    options?: {
      watchdogMs?: number;
      maxAttempts?: number;
      relays?: readonly string[];
      relayMode?: 'merge' | 'replace';
      affectsRelayAccess?: boolean;
    },
  ): () => void {
    if (options?.relays && options.relayMode === "replace") {
      return this.pinned.subscribe(this.pinned.targets(options), filter, onEvent, options);
    }
    // Optional `relays` override merges with the bridge's default relay
    // list. Used by callers that need to listen on relays the bridge
    // hasn't been switched to, e.g. the SFU RPC client, where the SFU
    // only publishes responses to its trusted relays (for example La Crypta)
    // while the dex tab might be on public.obelisk.ar. Without the
    // override, getRouterRtpCapabilities responses never reach the
    // browser and `start()` times out at 8s.
    const targetRelays = this.pinned.targets(options);
    const start = () => {
      const sub = this.subscribeWatched(targetRelays, filter, onEvent, undefined, options);
      this.subs.push(sub);
      return sub;
    };
    // Before the bridge has brought the active relay up, wait for it: a REQ
    // now would open that socket on the caller's behalf (logged out, before
    // `connect()` decided to), which the session fan-out owns.
    if (!options?.relays && !this.deps.activeSocketUp()) {
      let closed = false;
      let sub: ReturnType<typeof start> | null = null;
      let stopWaiting: () => void = () => {};
      stopWaiting = this.deps.connectionState.subscribe((state) => {
        if (closed || sub || state !== "Connected" || !this.deps.activeSocketUp()) return;
        sub = start();
        stopWaiting();
      });
      if (sub) stopWaiting();
      return () => {
        closed = true;
        stopWaiting();
        if (sub) this.closeTracked(sub);
      };
    }
    const sub = start();
    return () => this.closeTracked(sub);
  }

  closeTracked(sub: TrackedSub | undefined): void {
    if (!sub) return;
    try { sub.close(); } catch { /* ignore */ }
    this.subs = this.subs.filter((s) => s !== sub);
  }

  forgetPerGroupSub(
    groupId: string,
    subscribed: Set<string>,
    byGroup: Map<string, TrackedSub>,
  ): void {
    const sub = byGroup.get(groupId);
    if (sub) this.subs = this.subs.filter((s) => s !== sub);
    byGroup.delete(groupId);
    subscribed.delete(groupId);
  }
}
