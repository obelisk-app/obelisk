/**
 * The pool-backed transport: one nostr-tools `SimplePool` per identity, one
 * `RelayLike` per `(url, identity)` on top of it.
 *
 * Why a pool at all, when `nostr-relay-factory.ts` builds `AbstractRelay`s
 * directly: a `SimplePool` holds exactly one `AbstractRelay` per URL, so a
 * pool per identity is the hub's socket model unchanged, and it is the seam
 * the rest of obelisk already observes. The bridge's regression suites fake
 * `SimplePool` at the pool level (`vi.mock('nostr-tools')`); sockets that
 * never pass through a `SimplePool` are invisible to them. This is how the
 * hub owns the sockets while the existing tests keep watching the wire. It
 * is a migration seam, dated (round 6 ruling, `RULING-hub-pool-seam.md`)
 * and reassessed at step 7: the bridge's REQs now go through the registry
 * and reach the pool through `PoolBackedRelay.subscribe`, so the nine
 * pool-level suites still observe every REQ, retry and CLOSE. Re-hosting
 * them on `FakeRelay` is what lets `createNostrRelayFactory` become the
 * transport again.
 *
 * What the pool keeps and what the hub keeps:
 *  - the pool creates the `AbstractRelay` and connects it (`ensureRelay`);
 *    the hub decides WHEN (`connect()` here is `pool.ensureRelay`), tracks
 *    the generation, reconnects and enforces the budget;
 *  - the pool's `automaticallyAuth` is answered by the hub's lease table
 *    through `RelayFactoryHooks.autoAuth`, so a relay without a lease never
 *    gets a signer, whichever path opened the socket;
 *  - `relay.onclose`, which the pool uses only to forget the relay, is taken
 *    over so the hub sees the drop first; the pool keeps the dead relay and
 *    the next `ensureRelay` reconnects the same object, as `AbstractRelay`
 *    is designed to.
 */
import { SimplePool } from 'nostr-tools';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { normalizeURL } from './canonical';
import type {
  Identity,
  PoolRelayLike,
  RelayFactory,
  RelayFactoryHooks,
  RelayLike,
  RelaySubscribeParams,
  Signer,
  SimplePoolLike,
  SubscriptionLike,
} from './types';

export interface IdentityPoolOptions {
  /** Some relays push binary frames; obelisk passes its `TextCoercingWebSocket` here. */
  readonly websocketImplementation?: typeof WebSocket;
  /** Default true. */
  readonly enablePing?: boolean;
  /** Default false: the hub's supervisor owns reconnection. */
  readonly enableReconnect?: boolean;
  readonly automaticallyAuth?: (url: string) => Signer | null;
}

/**
 * The one place obelisk constructs a `SimplePool` in the browser: the hub's
 * per-identity pools (the session's, and one per DM call).
 */
export function createIdentityPool(opts: IdentityPoolOptions = {}): SimplePool {
  return new SimplePool({
    websocketImplementation: opts.websocketImplementation,
    enablePing: opts.enablePing ?? true,
    enableReconnect: opts.enableReconnect ?? false,
    automaticallyAuth: opts.automaticallyAuth,
  } as ConstructorParameters<typeof SimplePool>[0]);
}

export interface PoolBackedFactoryOptions {
  /** Builds the identity's pool. `automaticallyAuth` must be installed as given: it is the lease gate. */
  readonly createPool: (automaticallyAuth: (url: string) => Signer | null) => SimplePoolLike;
}

export interface PoolBackedRelayFactory {
  readonly factory: RelayFactory;
  /** True while the identity has a pool (from its first socket until `releaseIdentity`). */
  hasPool(identityId: string): boolean;
  /** Destroy the identity's pool and forget its relays; the hub's `RelayHubOptions.releaseIdentity`. */
  releaseIdentity(identityId: string): void;
}

interface IdentityPoolState {
  readonly pool: SimplePoolLike;
  readonly relays: Map<string, PoolBackedRelay>;
  hooks: RelayFactoryHooks | null;
}

/**
 * A `RelayLike` over `(pool, url)`. `connect` is `pool.ensureRelay`; the
 * other calls go to the `AbstractRelay` the pool resolved, or to the pool
 * itself where the pool-level call is the natural one.
 */
export class PoolBackedRelay implements RelayLike {
  onclose: (() => void) | null = null;
  private real: PoolRelayLike | null = null;
  private signer: Signer | undefined = undefined;

  constructor(
    readonly url: string,
    private readonly pool: SimplePoolLike,
  ) {}

  get connected(): boolean {
    return this.real?.connected ?? false;
  }

  get onauth(): Signer | undefined {
    return this.signer;
  }

  set onauth(value: Signer | undefined) {
    this.signer = value;
    if (this.real) this.real.onauth = value;
  }

  /** The relay's current NIP-42 challenge, if it sent one on this socket. */
  get challenge(): string | undefined {
    if (!this.real) return undefined;
    const value: unknown = (this.real as { challenge?: unknown }).challenge;
    return typeof value === 'string' ? value : undefined;
  }

  async connect(opts?: { timeout?: number }): Promise<void> {
    const real = await this.pool.ensureRelay(this.url, { connectionTimeout: opts?.timeout });
    this.adopt(real);
    if (!real.connected) throw new Error(`relay ${this.url} did not complete handshake`);
  }

  close(): void {
    // The pool forgets the relay on close; the next `connect` adopts the new one.
    this.real = null;
    this.pool.close([this.url]);
  }

  subscribe(filters: Filter[], params: RelaySubscribeParams): SubscriptionLike {
    const id = params.id ?? 'hub:' + Math.random().toString(36).slice(2, 10);
    const poolParams = {
      onevent: params.onevent,
      oneose: params.oneose,
      onclose: (reasons: string[]) => params.onclose?.(reasons[0] ?? ''),
      alreadyHaveEvent: params.alreadyHaveEvent,
      maxWait: params.eoseTimeout,
      label: params.label,
      id,
      onauth: this.signer,
    };
    const closer = this.pool.subscribeMap
      ? this.pool.subscribeMap(filters.map((filter) => ({ url: this.url, filter })), poolParams)
      : this.pool.subscribe([this.url], filters[0] ?? {}, poolParams);
    return { id, close: (reason) => closer.close(reason) };
  }

  publish(event: NostrEvent): Promise<string> {
    const [first] = this.pool.publish([this.url], event);
    return first ?? Promise.reject(new Error(`relay ${this.url}: pool returned no publish promise`));
  }

  async auth(sign: Signer): Promise<string> {
    const real = this.real ?? (await this.pool.ensureRelay(this.url));
    this.adopt(real);
    if (typeof real.auth !== 'function') throw new Error(`relay ${this.url} cannot perform AUTH`);
    return real.auth(sign);
  }

  private adopt(real: PoolRelayLike): void {
    if (this.real === real) return;
    this.real = real;
    // The pool set `onclose` to forget the relay. The hub needs the drop
    // first, and wants the object kept so the next handshake reuses it.
    real.onclose = () => this.onclose?.();
    if (this.signer) real.onauth = this.signer;
  }
}

export function createPoolBackedRelayFactory(opts: PoolBackedFactoryOptions): PoolBackedRelayFactory {
  const identities = new Map<string, IdentityPoolState>();

  const stateFor = (identityId: string): IdentityPoolState => {
    let state = identities.get(identityId);
    if (!state) {
      const created: { current: IdentityPoolState | null } = { current: null };
      const pool = opts.createPool((url) => {
        const hooks = created.current?.hooks;
        if (!hooks) return null;
        return hooks.autoAuth(url) ?? null;
      });
      state = { pool, relays: new Map(), hooks: null };
      created.current = state;
      identities.set(identityId, state);
    }
    return state;
  };

  const factory: RelayFactory = (url: string, identity: Identity, hooks: RelayFactoryHooks): RelayLike => {
    const state = stateFor(identity.id);
    state.hooks = hooks;
    const normalized = normalizeURL(url);
    let relay = state.relays.get(normalized);
    if (!relay) {
      relay = new PoolBackedRelay(normalized, state.pool);
      state.relays.set(normalized, relay);
    }
    return relay;
  };

  return {
    factory,
    hasPool: (identityId) => identities.has(identityId),
    releaseIdentity: (identityId) => {
      const state = identities.get(identityId);
      if (!state) return;
      identities.delete(identityId);
      state.relays.clear();
      try {
        state.pool.destroy?.();
      } catch {
        // Sockets already closed by the hub; nothing left to release.
      }
    },
  };
}
