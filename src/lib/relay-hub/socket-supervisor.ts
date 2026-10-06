/**
 * The reconnect supervisor (owner ruling: the hub's own, not nostr-tools
 * `enableReconnect`). A drop on a wanted socket schedules `relay.connect()`
 * after `retryDelay`; retries pause while `env.isOnline()` is false and
 * resume on `online`; a pending retry fires early when the document becomes
 * visible. The table (`sockets.ts`) owns which entries exist; this owns
 * getting each one up and keeping it up.
 */
import type { HubEnv } from './types';
import { errorMessage } from './env';
import {
  clearGrace,
  clearRetry,
  isWanted,
  rejectImpatient,
  retryDelay,
  settleWaiters,
  type SocketEntry,
  type SocketListener,
  type SocketTableOptions,
} from './socket-entry';

export class ReconnectSupervisor {
  constructor(
    private readonly env: HubEnv,
    private readonly opts: SocketTableOptions,
    private readonly listener: SocketListener,
    /** Whether the entry is still in the table; a forgotten entry is never retried. */
    private readonly isTracked: (entry: SocketEntry) => boolean,
  ) {}

  start(entry: SocketEntry): Promise<void> {
    if (entry.connectPromise) return entry.connectPromise;
    if (entry.connection === 'connected') return Promise.resolve();
    clearGrace(entry);
    clearRetry(entry);
    entry.connection = entry.generation === 0 ? 'connecting' : 'reconnecting';
    this.listener.onStatus(entry);
    const promise = entry.relay.connect({ timeout: this.opts.connectTimeoutMs }).then(
      () => {
        if (entry.connectPromise !== promise) return; // closed while handshaking
        entry.connectPromise = null;
        entry.generation += 1;
        entry.attempt = 0;
        entry.connection = 'connected';
        entry.lastError = null;
        // Re-issue first, report second: a listener acting on `connected`
        // (the bridge opening its login gate) finds the REQs already issued.
        this.listener.onOpen(entry);
        this.listener.onStatus(entry);
        settleWaiters(entry, null);
      },
      (err: unknown) => {
        if (entry.connectPromise !== promise) throw err;
        entry.connectPromise = null;
        entry.lastError = errorMessage(err);
        this.afterFailure(entry);
        throw err;
      },
    );
    // Nobody may be awaiting (supervisor retries); keep the rejection handled
    // here while callers who do await still see it.
    promise.catch(() => undefined);
    entry.connectPromise = promise;
    return promise;
  }

  handleDrop(entry: SocketEntry): void {
    // nostr-tools fires `onclose` twice on a timed-out handshake and once
    // more after our own `close()`; only a drop of an up socket is a drop.
    if (entry.connection !== 'connected') return;
    entry.connection = 'reconnecting';
    entry.lastError = 'relay connection closed';
    this.listener.onDrop(entry);
    if (isWanted(entry)) {
      this.scheduleRetry(entry);
    } else {
      entry.connection = 'idle';
    }
    this.listener.onStatus(entry);
  }

  resumeOffline(entries: readonly SocketEntry[]): void {
    for (const entry of entries) {
      if (entry.connection === 'offline') void this.start(entry);
    }
  }

  retryVisible(entries: readonly SocketEntry[]): void {
    if (this.env.isHidden()) return;
    for (const entry of entries) {
      if (entry.retryTimer) {
        clearRetry(entry);
        void this.start(entry);
      }
    }
  }

  private afterFailure(entry: SocketEntry): void {
    if (!this.isTracked(entry)) return;
    rejectImpatient(entry, new Error(`relay ${entry.url} unreachable (${entry.lastError ?? 'connect failed'})`));
    if (isWanted(entry)) {
      this.scheduleRetry(entry);
    } else {
      entry.connection = 'failed';
      settleWaiters(entry, new Error(`relay ${entry.url} unreachable (${entry.lastError ?? 'connect failed'})`));
    }
    this.listener.onStatus(entry);
  }

  private scheduleRetry(entry: SocketEntry): void {
    if (entry.retryTimer) return;
    if (!this.env.isOnline()) {
      entry.connection = 'offline';
      return;
    }
    if (entry.attempt >= this.opts.backoff.maxAttempts) {
      entry.connection = 'failed';
      settleWaiters(entry, new Error(`relay ${entry.url} gave up after ${entry.attempt} attempts`));
      return;
    }
    entry.attempt += 1;
    const delay = retryDelay(entry.attempt, this.opts.backoff, this.env.random());
    entry.connection = 'reconnecting';
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      void this.start(entry);
    }, delay);
  }
}
