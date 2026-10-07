/**
 * The narrow seam the bridge's modules see of `BridgeImpl` (round 4
 * decomposition plan, §2). A module never reaches into another module's
 * state: anything shared is a method or a `StateStore` on this context, so
 * every cross-module dependency is a named line here. `BridgeImpl` builds
 * one instance in its constructor; the closures read the facade's current
 * fields at call time, so `relays()` follows `switchRelay` and `session()`
 * follows login and logout.
 */
import type { Event as NostrEvent, EventTemplate, Filter, VerifiedEvent } from 'nostr-tools';
import type { QueryCacheMode, SubPriority } from '@/lib/relay-hub';
import type { StateStore } from '../common/state-store';
import type { PersistedSession } from '../session/session-storage';
import type { JsDirectMessage, JsGroup, JsMessage, RelayAccessState } from '../common/types';

/**
 * A live REQ the facade tracks so it can close everything on a session or
 * relay reset. `close` releases the holder: the hub's registry CLOSEs the
 * wire REQ only when the last holder of that filter on that relay is gone.
 */
export interface TrackedSub {
  close: () => void;
  /** Move this holder's REQ in the hub's re-issue order (the channel in view goes first). */
  setPriority?: (priority: SubPriority) => void;
}

/** Options of `BridgeImpl.subscribeWatched`, the bridge's view of a hub REQ. */
export interface WatchedSubOptions {
  /** No EVENT and no EOSE in this window closes and re-issues the REQ with backoff. Default 5000. */
  watchdogMs?: number;
  /** Issues without an event in between before the hub gives up. Default unbounded. */
  maxAttempts?: number;
  /** Where the REQ sits in the hub's priority order (budget parking, reconnect re-issue). Default `'background'`. */
  priority?: SubPriority;
  affectsRelayAccess?: boolean;
  /**
   * When true, an `auth-required` / `restricted` CLOSED for this sub
   * downgrades relay-access state **immediately** (no 4s soak). Used by the
   * dedicated preflight REQ so the user sees a "Not whitelisted" banner
   * within ~1.5s instead of waiting through the deferred soak window. Other
   * subs keep the soak so transient AUTH races don't flash the banner.
   */
  immediateAccessDowngrade?: boolean;
  onQuotaOrRateLimitClose?: () => void;
  bypassWot?: boolean;
}

/** The NIP-42 signer the session installs on its sockets. */
/**
 * How a one-shot read uses the hub's result cache (60 s for a complete
 * answer, 10 s for an uncertain one; see `lib/relay-hub/query.ts`).
 * `'cached-ok'` (the default) serves an unexpired result; `'fresh'` goes to
 * the wire and refreshes the cache; `'bypass'` goes to the wire and leaves
 * the cache alone.
 */
export interface QueryOpts {
  readonly cache?: QueryCacheMode;
}

export type AuthSigner = (evt: EventTemplate) => Promise<VerifiedEvent>;

export interface SetRelayAccessOpts {
  override?: boolean;
  fromEose?: boolean;
}

export interface BridgeContext {
  /** Identity. Null when logged out. */
  session(): PersistedSession | null;
  /** The active relay list (`BridgeImpl.relays`, always length 1 today), read live. */
  relays(): string[];
  readonly currentRelayUrl: StateStore<string>;
  readonly relayAccess: StateStore<Record<string, RelayAccessState>>;
  /** The relay rail (`BridgeImpl.configuredRelays`). */
  readonly configuredRelays: StateStore<string[]>;
  /** Reactive mirror of the session pubkey (session module). */
  readonly myPubkey: StateStore<string | null>;
  /** DM threads by peer (dm module); read by the WoT consensual-DM predicate. */
  readonly dmsByPeer: StateStore<Record<string, JsDirectMessage[]>>;
  /** The gate AppShell observes (session module). */
  readonly isLoggedIn: StateStore<boolean>;
  /** Group metadata (groups/metadata module); read for channel names. */
  readonly groups: StateStore<JsGroup[]>;
  /** Messages by group (groups/messages module); read for reply-parent lookups. */
  readonly messagesByGroup: StateStore<Record<string, JsMessage[]>>;
  /** Watched subscription seam: `hub.subscribe` with the bridge's access reporting and WoT gate around it (`BridgeImpl.subscribeWatched`). */
  subscribeWatched(
    relays: string[],
    filter: Filter,
    onevent: (ev: NostrEvent) => void,
    oneose?: () => void,
    options?: WatchedSubOptions,
  ): TrackedSub;
  /** Register a REQ with the facade so a session or relay reset closes it. */
  track(...subs: TrackedSub[]): void;
  /** Close a tracked REQ and forget it. */
  closeTracked(sub: TrackedSub | undefined): void;
  /** Forget a tracked REQ without closing it (the relay already did). */
  untrack(sub: TrackedSub): void;
  /**
   * One-shot query seam over `hub.query` (`RequestsModule.queryRelaysWithConfidence`).
   * Served from the hub's result cache by default; `opts.cache` names the
   * exception (`'fresh'` or `'bypass'`), and each such call site says why.
   */
  queryRelaysWithConfidence(
    relays: readonly string[],
    filter: Filter,
    maxWait: number,
    opts?: QueryOpts,
  ): Promise<{ events: NostrEvent[]; complete: boolean }>;
  /**
   * Several `{kinds, authors, limit}` reads as one REQ through the hub's
   * author batching (`lib/relay-hub/batch.ts`), handed back per filter.
   * Same cache rules as {@link queryRelaysWithConfidence}.
   */
  queryAuthorsWithConfidence(
    relays: readonly string[],
    filters: readonly Filter[],
    maxWait: number,
    opts?: QueryOpts,
  ): Promise<{ perFilter: NostrEvent[][]; complete: boolean }>;
  /** Signing and publishing seams (`publish.ts`). */
  signAndPublish(
    template: { kind: number; content: string; tags: string[][]; created_at: number },
    relayOpts?: PublishRelayOpts | readonly string[],
    opts?: { quiet?: boolean },
  ): Promise<NostrEvent>;
  publishEvent(
    template: { kind: number; content: string; tags: string[][]; created_at?: number },
    opts?: PublishRelayOpts,
  ): Promise<NostrEvent>;
  /** Relay-access reporting (relay-access state machine, facade today). */
  setRelayAccess(url: string, state: RelayAccessState, opts?: SetRelayAccessOpts): void;
  setRelayAccessDeferred(url: string, state: RelayAccessState): void;
}

/**
 * Options for `publishEvent`. `mode: 'merge'` (default) publishes to the
 * union of the active relays and `extraRelays`; `mode: 'replace'` publishes
 * ONLY to `extraRelays`. Used by per-relay state events that must not leak
 * to the user's other relays.
 */
export interface PublishRelayOpts {
  readonly extraRelays?: readonly string[];
  readonly mode?: 'merge' | 'replace';
  /**
   * Suppress the sign/publish entries in the activity log. For background
   * writes the user did not ask for and cannot act on: a read-state cursor
   * flush is the motivating case, since it fires on every channel open and
   * made the app look like it was saving settings on navigation.
   */
  readonly quiet?: boolean;
  /**
   * On a `restricted:` or `auth-required:` refusal, AUTH that socket
   * explicitly and publish once more. For writes to a relay the pool never
   * AUTHs on its own (a voice relay pinned while the user browses another),
   * where a whitelist relay refuses the pre-AUTH EVENT with `restricted:`
   * and nostr-tools, which only retries on `auth-required: `, gives up.
   */
  readonly authRetryOnRestricted?: boolean;
  /**
   * Give up if the NIP-07 / NIP-46 signer hasn't *started* on this event
   * within this many ms (it is queued behind other signer work). For events
   * that are worthless late: a voice SDP answer the peer stopped waiting
   * for. Rejects with `SignerQueueTimeoutError`; a local key never waits.
   */
  readonly signStartDeadlineMs?: number;
}
