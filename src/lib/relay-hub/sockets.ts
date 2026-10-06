/**
 * The socket table: one `RelayLike` per `(normalizeURL(url), identity.id)`,
 * reused across socket generations, plus the reconnect supervisor and the
 * socket budget.
 *
 * Supervisor (owner ruling: the hub's own, not nostr-tools `enableReconnect`):
 * a drop on a wanted socket schedules `relay.connect()` after
 * `min(baseMs * 2^(attempt-1), maxMs)` with +-`jitter`, starting at ~1 s.
 * Retries pause while `env.isOnline()` is false and resume on `online`; a
 * pending retry fires early when the document becomes visible. Every state
 * is exposed as `ConnectionState` so the UI can render it. A socket is
 * "wanted" while it has an explicit `connect()` hold or at least one live
 * subscription; a socket opened only for a one-shot query is not revived.
 *
 * Budget and eviction order (identities multiply sockets):
 *   1. sockets inside their `disconnect(graceMs)` window, oldest first;
 *   2. sockets nobody holds (no explicit hold, no live subscription, no
 *      in-flight query or publish), least recently used first;
 *   3. otherwise `ensure` throws `socket-budget`. A socket with live
 *      subscriptions is never evicted silently.
 *
 * The entry record and its helpers live in `socket-entry.ts` and the
 * supervisor in `socket-supervisor.ts`; this file is the table.
 */
import type { HubEnv, Identity, RelayFactory } from './types';
import { normalizeURL, socketKey } from './canonical';
import { HubError, errorMessage } from './env';
import {
  addWaiter,
  clearGrace,
  clearRetry,
  createSocketEntry,
  evictionVictim,
  isWanted,
  settleWaiters,
  type SocketEntry,
  type SocketListener,
  type SocketTableOptions,
} from './socket-entry';
import { ReconnectSupervisor } from './socket-supervisor';

export { DEFAULT_BACKOFF, isWanted } from './socket-entry';
export type { SocketEntry, SocketListener, SocketTableOptions } from './socket-entry';

export class SocketTable {
  private readonly entries = new Map<string, SocketEntry>();
  private readonly supervisor: ReconnectSupervisor;
  private readonly onOnline = () => this.supervisor.resumeOffline(this.all());
  private readonly onVisibility = () => this.supervisor.retryVisible(this.all());
  private disposed = false;

  constructor(
    private readonly factory: RelayFactory,
    private readonly env: HubEnv,
    private readonly opts: SocketTableOptions,
    private readonly listener: SocketListener,
  ) {
    this.supervisor = new ReconnectSupervisor(env, opts, listener, (entry) => this.entries.has(entry.key));
    env.events?.addEventListener('online', this.onOnline);
    env.events?.addEventListener('visibilitychange', this.onVisibility);
  }

  get(url: string, identityId: string): SocketEntry | undefined {
    return this.entries.get(socketKey(url, identityId));
  }

  all(): SocketEntry[] {
    return Array.from(this.entries.values());
  }

  forIdentity(identityId: string): SocketEntry[] {
    return this.all().filter((e) => e.identity.id === identityId);
  }

  /**
   * Find or create the entry without starting a handshake. Used when the
   * transport is opening the socket itself and the hub only needs the
   * bookkeeping (and `onauth`) in place before the first frame arrives.
   * Throws `socket-budget` when the table is full of held sockets.
   */
  track(url: string, identity: Identity): SocketEntry {
    if (this.disposed) throw new HubError('relay hub disposed', 'disposed');
    let normalized: string;
    try {
      normalized = normalizeURL(url);
    } catch (err) {
      throw new HubError(errorMessage(err), 'invalid-url');
    }
    const key = socketKey(normalized, identity.id);
    let entry = this.entries.get(key);
    if (!entry) {
      this.makeRoom();
      const hooks = { autoAuth: (u: string) => this.listener.autoAuth(u, identity) };
      const created = createSocketEntry(key, normalized, identity, this.factory(normalized, identity, hooks), this.env.now());
      created.relay.onclose = () => this.supervisor.handleDrop(created);
      this.entries.set(key, created);
      this.listener.onCreate(created);
      entry = created;
    }
    entry.lastUsedAt = this.env.now();
    return entry;
  }

  /**
   * Find or create the socket and make sure it is connecting or up.
   * Throws `socket-budget` when the table is full of held sockets.
   */
  ensure(url: string, identity: Identity): SocketEntry {
    const entry = this.track(url, identity);
    clearGrace(entry);
    if (entry.connection === 'idle' || entry.connection === 'failed') {
      entry.attempt = 0;
      void this.supervisor.start(entry);
    } else if (entry.connection === 'offline' && this.env.isOnline()) {
      void this.supervisor.start(entry);
    }
    return entry;
  }

  /** The current handshake promise, or an immediately settled one. */
  connect(entry: SocketEntry): Promise<void> {
    if (entry.connection === 'connected') return Promise.resolve();
    return this.supervisor.start(entry);
  }

  /**
   * Resolves when the socket is up (now or on its next generation). Rejects
   * on timeout or when the socket is forgotten; with `failFast`, also on the
   * first attempt that fails while the supervisor keeps retrying behind it.
   */
  whenConnected(entry: SocketEntry, timeoutMs: number, opts?: { failFast?: boolean }): Promise<void> {
    if (entry.connection === 'connected') return Promise.resolve();
    return addWaiter(entry, timeoutMs, opts?.failFast ?? false);
  }

  /** An explicit request to be up now: a retry the supervisor has scheduled fires at once. */
  retryNow(entry: SocketEntry): void {
    if (!entry.retryTimer) return;
    clearRetry(entry);
    void this.supervisor.start(entry);
  }

  /**
   * Close the socket now, keep the entry, and reconnect at once if anything
   * wants it. For a half-open socket the relay has already given up on.
   */
  recycle(entry: SocketEntry): void {
    this.close(entry, false);
    if (isWanted(entry)) {
      entry.attempt = 0;
      void this.supervisor.start(entry);
    }
  }

  /**
   * Drop the explicit hold. With live subscriptions the socket stays. With
   * `graceMs > 0` and nothing else wanting it, the socket stays that long
   * and closes unless `ensure` runs first.
   */
  disconnect(entry: SocketEntry, graceMs: number): void {
    entry.explicit = false;
    if (entry.subs > 0) return;
    if (graceMs > 0) {
      if (entry.graceTimer) clearTimeout(entry.graceTimer);
      entry.graceTimer = setTimeout(() => {
        entry.graceTimer = null;
        if (!isWanted(entry) && entry.busy === 0) this.close(entry, true);
      }, graceMs);
      return;
    }
    this.close(entry, true);
  }

  /**
   * Close the socket now. `forget` removes it from the table; otherwise the
   * entry stays idle and `ensure` reconnects it later (identity rebind).
   * Live subscriptions go pending through `onDrop` before nostr-tools runs
   * their `onclose` callbacks, so the registry never mistakes this for a
   * relay verdict.
   */
  close(entry: SocketEntry, forget: boolean): void {
    clearRetry(entry);
    clearGrace(entry);
    const wasUp = entry.connection === 'connected' || entry.connectPromise !== null;
    entry.connection = 'idle';
    entry.connectPromise = null;
    settleWaiters(entry, new Error(`relay ${entry.url} closed`));
    if (wasUp) this.listener.onDrop(entry);
    try {
      entry.relay.close();
    } catch {
      // A socket that is already gone is what we wanted.
    }
    if (forget) {
      this.entries.delete(entry.key);
      this.listener.onForget(entry);
    }
    this.listener.onStatus(entry);
  }

  /** Identity value changed: rebuild its sockets, keeping the entries (and their subscriptions) alive. */
  rebind(identity: Identity): void {
    for (const entry of this.forIdentity(identity.id)) {
      entry.identity = identity;
      this.close(entry, false);
      entry.attempt = 0;
      if (isWanted(entry)) void this.supervisor.start(entry);
    }
  }

  closeIdentity(identityId: string): void {
    for (const entry of this.forIdentity(identityId)) this.close(entry, true);
  }

  dispose(): void {
    this.disposed = true;
    this.env.events?.removeEventListener('online', this.onOnline);
    this.env.events?.removeEventListener('visibilitychange', this.onVisibility);
    for (const entry of this.all()) this.close(entry, true);
  }

  private makeRoom(): void {
    if (this.entries.size < this.opts.maxSockets) return;
    const victim = evictionVictim(this.all());
    if (!victim) {
      throw new HubError(`socket budget of ${this.opts.maxSockets} exhausted; every socket is held`, 'socket-budget');
    }
    this.close(victim, true);
  }
}
