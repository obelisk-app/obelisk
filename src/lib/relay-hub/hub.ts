/**
 * RelayHub: the single connection owner. Composes the socket table (one
 * `RelayLike` per `(relay, identity)` plus the reconnect supervisor and the
 * socket budget), the AUTH layer (one record per `relay|pubkey`), the
 * refcounted subscription registry, the one-shot query path and the
 * `SimplePool`-shaped facade. Zero imports from the rest of obelisk.
 *
 * The NIP-42 lease policy lives in `auth-policy.ts`, the publish path in
 * `hub-publish.ts`, the status rows in `hub-status.ts` and the small wiring
 * helpers in `hub-adapters.ts`; this class composes them.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import type {
  AuthLease,
  AuthLeaseReason,
  HubEnv,
  Identity,
  PoolLike,
  PublishResult,
  PublishSpec,
  QueryResult,
  QuerySpec,
  RelayHub,
  RelayHubOptions,
  RelayLike,
  RelayStatus,
  SubscribeSpec,
  SubscriptionHandle,
} from './types';
import { SESSION_IDENTITY_ID } from './types';
import { AuthLayer } from './auth';
import { AuthPolicy } from './auth-policy';
import { HubError, defaultEnv } from './env';
import { bindHub } from './hub-adapters';
import { publishToRelays } from './hub-publish';
import { StatusFeed, idleStatus, socketStatus } from './hub-status';
import { createPoolLike } from './pool-like';
import { DEFAULT_QUERY_OPTIONS, QueryPath } from './query';
import { SubscriptionRegistry } from './registry';
import { DEFAULT_BACKOFF, SocketTable, type SocketEntry } from './sockets';

export const DEFAULT_MAX_SOCKETS = 16;
export const DEFAULT_MAX_SUBS_PER_SOCKET = 40;
export const DEFAULT_CONNECT_TIMEOUT_MS = 8000;

export class RelayHubImpl implements RelayHub {
  readonly env: HubEnv;
  readonly sockets: SocketTable;
  readonly auth: AuthLayer;
  readonly registry: SubscriptionRegistry;
  readonly queries: QueryPath;

  private readonly identities = new Map<string, Identity>();
  private readonly policy: AuthPolicy;
  private readonly feed = new StatusFeed((entry) => socketStatus(entry, this.auth, this.registry));
  private readonly connectTimeoutMs: number;
  private readonly releaseIdentity: ((identityId: string) => void) | null;
  private facade: PoolLike | null = null;
  private disposed = false;

  constructor(opts: RelayHubOptions) {
    this.env = defaultEnv(opts.env);
    this.connectTimeoutMs = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.releaseIdentity = opts.releaseIdentity ?? null;
    const backoff = { ...DEFAULT_BACKOFF, ...opts.backoff };
    this.auth = new AuthLayer(this.env, (record) => {
      const entry = this.sockets.get(record.url, record.identityId);
      if (entry) this.emitStatus(entry);
    });
    this.sockets = new SocketTable(
      opts.relayFactory,
      this.env,
      { maxSockets: opts.maxSockets ?? DEFAULT_MAX_SOCKETS, connectTimeoutMs: this.connectTimeoutMs, backoff },
      {
        onCreate: (entry) => this.policy.syncOnauth(entry),
        onOpen: (entry) => {
          this.policy.syncOnauth(entry);
          this.registry.onSocketOpen(entry);
        },
        onDrop: (entry) => {
          this.auth.onSocketDrop(entry);
          this.registry.onSocketDrop(entry);
        },
        onStatus: (entry) => this.emitStatus(entry),
        onForget: (entry) => {
          this.auth.drop(entry);
          this.registry.onSocketForget(entry);
        },
        autoAuth: (url, identity) => this.policy.autoAuthFor(url, identity),
      },
    );
    this.policy = new AuthPolicy({
      sockets: this.sockets,
      auth: this.auth,
      emitStatus: (entry) => this.emitStatus(entry),
      isDisposed: () => this.disposed,
    });
    this.registry = new SubscriptionRegistry(this.sockets, this.auth, {
      maxSubsPerSocket: opts.maxSubsPerSocket ?? DEFAULT_MAX_SUBS_PER_SOCKET,
      backoff,
      closedRetryAttempts: 3,
      quotaPenaltyMs: 60_000,
    });
    this.queries = new QueryPath(this.sockets, this.env, DEFAULT_QUERY_OPTIONS);
  }

  // ---- identities and AUTH policy ----------------------------------------------

  setIdentity(identity: Identity): void {
    this.assertLive();
    const prev = this.identities.get(identity.id);
    this.identities.set(identity.id, identity);
    if (prev && (prev.pubkey !== identity.pubkey || prev.authPolicy !== identity.authPolicy)) {
      // A socket the relay bound to pubkey X must never be reused by Y.
      this.auth.dropIdentity(identity.id);
      this.queries.clearIdentity(identity.id);
      this.sockets.rebind(identity);
      return;
    }
    for (const entry of this.sockets.forIdentity(identity.id)) {
      entry.identity = identity;
      this.policy.syncOnauth(entry);
    }
  }

  removeIdentity(identityId: string): void {
    if (!this.identities.has(identityId)) return;
    this.registry.removeIdentity(identityId);
    this.sockets.closeIdentity(identityId);
    this.auth.dropIdentity(identityId);
    this.queries.clearIdentity(identityId);
    this.policy.dropIdentity(identityId);
    this.identities.delete(identityId);
    this.releaseIdentity?.(identityId);
  }

  getIdentity(identityId: string): Identity | undefined {
    return this.identities.get(identityId);
  }

  acquireAuthLease(url: string, reason: AuthLeaseReason, identityId: string = SESSION_IDENTITY_ID): AuthLease {
    this.assertLive();
    return this.policy.acquire(url, reason, this.identity(identityId));
  }

  leaseCount(url: string, identityId: string = SESSION_IDENTITY_ID): number {
    return this.policy.count(url, identityId);
  }

  promptCount(): number {
    return this.auth.totalPrompts();
  }

  // ---- connections --------------------------------------------------------------

  /**
   * An explicit request to be up: holds the socket, fires a retry the
   * supervisor had scheduled at once, and rejects as soon as the attempt it
   * is waiting on fails (the supervisor keeps retrying behind the caller).
   */
  connect(url: string, opts?: { identityId?: string; timeoutMs?: number }): Promise<void> {
    this.assertLive();
    const identity = this.identity(opts?.identityId ?? SESSION_IDENTITY_ID);
    const entry = this.sockets.ensure(url, identity);
    entry.explicit = true;
    this.sockets.retryNow(entry);
    return this.sockets.whenConnected(entry, opts?.timeoutMs ?? this.connectTimeoutMs, { failFast: true });
  }

  disconnect(url: string, opts?: { identityId?: string; graceMs?: number }): void {
    const entry = this.sockets.get(url, opts?.identityId ?? SESSION_IDENTITY_ID);
    if (!entry) return;
    this.sockets.disconnect(entry, opts?.graceMs ?? 0);
  }

  dropSocket(url: string, identityId: string = SESSION_IDENTITY_ID): void {
    const entry = this.sockets.get(url, identityId);
    if (!entry) return;
    this.sockets.recycle(entry);
  }

  status(url: string, identityId: string = SESSION_IDENTITY_ID): RelayStatus {
    const entry = this.sockets.get(url, identityId);
    if (entry) return this.statusOf(entry);
    return idleStatus(url, identityId, DEFAULT_MAX_SUBS_PER_SOCKET);
  }

  statuses(): readonly RelayStatus[] {
    return this.sockets.all().map((e) => this.statusOf(e));
  }

  onStatus(cb: (status: RelayStatus) => void): () => void {
    return this.feed.subscribe(cb);
  }

  // ---- data ---------------------------------------------------------------------

  subscribe(spec: SubscribeSpec): SubscriptionHandle {
    this.assertLive();
    const identity = this.identity(spec.identityId ?? SESSION_IDENTITY_ID);
    return this.registry.subscribe(spec, identity);
  }

  query(spec: QuerySpec): Promise<QueryResult> {
    this.assertLive();
    const identity = this.identity(spec.identityId ?? SESSION_IDENTITY_ID);
    return this.queries.query(spec, identity);
  }

  /** One result per distinct relay, in spec order; see `hub-publish.ts`. */
  publish(spec: PublishSpec): Promise<readonly PublishResult[]> {
    this.assertLive();
    const identity = this.identity(spec.identityId ?? SESSION_IDENTITY_ID);
    return publishToRelays({ sockets: this.sockets, auth: this.auth }, spec, identity);
  }

  // ---- adapters -----------------------------------------------------------------

  poolLike(): PoolLike {
    if (!this.facade) {
      this.facade = createPoolLike({
        ...bindHub(this),
        relayFor: (url, identityId, timeoutMs) => this.relayFor(url, identityId, timeoutMs),
        connectedUrls: (identityId) => this.connectedUrls(identityId),
      });
    }
    return this.facade;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.registry.dispose();
    this.sockets.dispose();
    this.feed.clear();
    this.policy.clear();
    this.identities.clear();
  }

  // ---- internals ------------------------------------------------------------------

  /** Facade helper: the socket's relay once connected. */
  async relayFor(url: string, identityId: string, timeoutMs?: number): Promise<RelayLike> {
    const identity = this.identity(identityId);
    const entry = this.sockets.ensure(url, identity);
    await this.sockets.whenConnected(entry, timeoutMs ?? this.connectTimeoutMs);
    return entry.relay;
  }

  connectedUrls(identityId: string): Map<string, boolean> {
    const out = new Map<string, boolean>();
    for (const entry of this.sockets.forIdentity(identityId)) out.set(entry.url, entry.connection === 'connected');
    return out;
  }

  private identity(id: string): Identity {
    const identity = this.identities.get(id);
    if (!identity) throw new HubError(`unknown identity '${id}'; call setIdentity first`, 'unknown-identity');
    return identity;
  }

  private assertLive(): void {
    if (this.disposed) throw new HubError('relay hub disposed', 'disposed');
  }

  private statusOf(entry: SocketEntry): RelayStatus {
    return socketStatus(entry, this.auth, this.registry);
  }

  private emitStatus(entry: SocketEntry): void {
    this.feed.emit(entry);
  }
}

export function createRelayHub(opts: RelayHubOptions): RelayHubImpl {
  return new RelayHubImpl(opts);
}

export type { NostrEvent };
