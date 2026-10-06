/**
 * RelayHub transport seams, split out of `types.ts` (which re-exports them):
 * what the hub consumes from nostr-tools (`RelayLike`), the `SimplePool`
 * surface a pool-backed hub is built on, and the `SimplePool`-shaped facade
 * `@nostr-wot/data` receives. Imports only `nostr-tools` and `./types`.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { Identity, RelayUrl, Signer } from './types';

// ---- inbound seam: what the hub consumes from nostr-tools -----------------

export interface SubscriptionLike {
  readonly id: string;
  close(reason?: string): void;
}

export interface RelaySubscribeParams {
  onevent?: (evt: NostrEvent) => void;
  oneose?: () => void;
  onclose?: (reason: string) => void;
  alreadyHaveEvent?: (id: string) => boolean;
  eoseTimeout?: number;
  label?: string;
  id?: string;
}

/**
 * The `AbstractRelay` surface the hub drives. nostr-tools' class satisfies
 * it structurally (checked at compile time in `nostr-relay-factory.ts`);
 * `FakeRelay` implements it in tests. The hub never uses `enableReconnect`:
 * the supervisor in `sockets.ts` owns reconnection.
 */
export interface RelayLike {
  readonly url: string;
  readonly connected: boolean;
  onclose: (() => void) | null;
  onauth: undefined | Signer;
  connect(opts?: { timeout?: number }): Promise<void>;
  close(): void;
  subscribe(filters: Filter[], params: RelaySubscribeParams): SubscriptionLike;
  publish(event: NostrEvent): Promise<string>;
  auth(sign: Signer): Promise<string>;
}

/**
 * What the hub hands a factory besides the URL and identity. `autoAuth` is
 * the hub's answer to "may this socket answer AUTH right now": the signer
 * installed as `onauth` for `(url, identity)`, or undefined without a lease.
 * A pool-backed transport routes nostr-tools' `automaticallyAuth` here so
 * the lease table stays the single source of AUTH permission.
 */
export interface RelayFactoryHooks {
  autoAuth(url: string): Signer | undefined;
}

/** Builds one socket. Called once per `(normalizeURL(url), identity.id)`; the instance is reused across generations. */
export type RelayFactory = (url: RelayUrl, identity: Identity, hooks: RelayFactoryHooks) => RelayLike;

// ---- pool-level transport: the `SimplePool` surface the hub can be built on ----

export interface PoolPublishParams {
  onauth?: Signer;
  maxWait?: number;
}

/**
 * The nostr-tools `SimplePool` surface the pool-backed transport drives.
 * Structural on purpose: the production object is a real `SimplePool`, and
 * the bridge's regression suites substitute a pool-level fake for it.
 */
export interface SimplePoolLike {
  ensureRelay(url: string, params?: { connectionTimeout?: number }): Promise<PoolRelayLike>;
  subscribe(relays: string[], filter: Filter, params: PoolSubscribeParams & { onauth?: Signer }): SubCloser;
  subscribeMap?(requests: { url: string; filter: Filter }[], params: PoolSubscribeParams & { onauth?: Signer }): SubCloser;
  querySync(relays: string[], filter: Filter, params?: { maxWait?: number }): Promise<NostrEvent[]>;
  publish(relays: string[], event: NostrEvent, params?: PoolPublishParams): Promise<string>[];
  close(relays: string[]): void;
  listConnectionStatus?(): Map<string, boolean>;
  /** Close every relay and forget them; nostr-tools' `SimplePool.destroy`. */
  destroy?(): void;
}

/**
 * What a pool's `ensureRelay` resolves to: a nostr-tools `AbstractRelay`, or
 * a test's stand-in for one. (`challenge` is public at runtime but private in
 * nostr-tools' typings, so it is read by a runtime check, not declared here.)
 */
export interface PoolRelayLike {
  readonly connected: boolean;
  onclose?: (() => void) | null;
  onauth?: Signer | undefined;
  auth?(sign: Signer): Promise<string>;
  publish?(event: NostrEvent): Promise<string>;
}

// ---- outbound facade: what `@nostr-wot/data`'s `setPool()` receives --------

export interface PoolSubscribeParams {
  onevent?: (evt: NostrEvent) => void;
  /** Once, when every relay has answered EOSE (or closed). */
  oneose?: () => void;
  /** Once, when every relay's REQ is closed, with one reason per relay. */
  onclose?: (reasons: string[]) => void;
  alreadyHaveEvent?: (id: string) => boolean;
  maxWait?: number;
  label?: string;
  id?: string;
}

export interface SubCloser {
  close(reason?: string): void;
}

/**
 * The `SimplePool`-shaped facade. Everything routes through the hub's
 * `subscribe`/`query`/`publish`, so SDK reads share sockets, dedupe, the
 * budget and the AUTH policy. It always acts as the `'session'` identity.
 */
export interface PoolLike {
  ensureRelay(url: string, params?: { connectionTimeout?: number }): Promise<RelayLike>;
  subscribe(relays: string[], filter: Filter, params: PoolSubscribeParams): SubCloser;
  subscribeMany(relays: string[], filter: Filter, params: PoolSubscribeParams): SubCloser;
  subscribeManyEose(relays: string[], filter: Filter, params: PoolSubscribeParams): SubCloser;
  subscribeMap(requests: { url: string; filter: Filter }[], params: PoolSubscribeParams): SubCloser;
  querySync(relays: string[], filter: Filter, params?: { maxWait?: number }): Promise<NostrEvent[]>;
  get(relays: string[], filter: Filter, params?: { maxWait?: number }): Promise<NostrEvent | null>;
  publish(relays: string[], event: NostrEvent): Promise<string>[];
  close(relays: string[]): void;
  listConnectionStatus(): Map<string, boolean>;
  destroy(): void;
}
