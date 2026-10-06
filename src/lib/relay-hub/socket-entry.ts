/**
 * One row of the socket table (`SocketEntry`), the listener contract the
 * hub plugs into the table, and the small operations on one entry that need
 * no table state: waiters, timers, the eviction order and the retry delay.
 */
import type { BackoffPolicy, ConnectionState, Identity, RelayLike, RelayUrl, Signer } from './types';

export interface Waiter {
  resolve(): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout> | null;
  /** Reject on the first failed attempt instead of waiting out the supervisor's retry. */
  failFast: boolean;
}

export interface SocketEntry {
  readonly key: string;
  readonly url: RelayUrl;
  identity: Identity;
  readonly relay: RelayLike;
  /** Incremented on every successful handshake. */
  generation: number;
  connection: ConnectionState;
  lastError: string | null;
  /** Explicit `connect()` hold. */
  explicit: boolean;
  /** Live subscriptions attached; maintained by the registry. */
  subs: number;
  /** In-flight queries and publishes; the budget never evicts a busy socket. */
  busy: number;
  lastUsedAt: number;
  attempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  connectPromise: Promise<void> | null;
  waiters: Waiter[];
}

export interface SocketListener {
  /** A new entry, before its first handshake starts: install `onauth` here so no AUTH frame can arrive unanswered. */
  onCreate(entry: SocketEntry): void;
  /** After `generation` incremented and `connection === 'connected'`. */
  onOpen(entry: SocketEntry): void;
  /** Transport drop or hub-initiated close. Fires BEFORE nostr-tools runs the subscriptions' `onclose` callbacks. */
  onDrop(entry: SocketEntry): void;
  /** Any connection-state or error change. */
  onStatus(entry: SocketEntry): void;
  /** The entry left the table. */
  onForget(entry: SocketEntry): void;
  /** The signer `(url, identity)` may answer AUTH with right now, or undefined without a lease. */
  autoAuth(url: string, identity: Identity): Signer | undefined;
}

export interface SocketTableOptions {
  readonly maxSockets: number;
  readonly connectTimeoutMs: number;
  readonly backoff: BackoffPolicy;
}

export const DEFAULT_BACKOFF: BackoffPolicy = { baseMs: 1000, maxMs: 30_000, jitter: 0.2, maxAttempts: Infinity };

export function isWanted(entry: SocketEntry): boolean {
  return entry.explicit || entry.subs > 0;
}

export function createSocketEntry(key: string, url: RelayUrl, identity: Identity, relay: RelayLike, now: number): SocketEntry {
  return {
    key,
    url,
    identity,
    relay,
    generation: 0,
    connection: 'idle',
    lastError: null,
    explicit: false,
    subs: 0,
    busy: 0,
    lastUsedAt: now,
    attempt: 0,
    retryTimer: null,
    graceTimer: null,
    connectPromise: null,
    waiters: [],
  };
}

export function clearGrace(entry: SocketEntry): void {
  if (entry.graceTimer) {
    clearTimeout(entry.graceTimer);
    entry.graceTimer = null;
  }
}

export function clearRetry(entry: SocketEntry): void {
  if (entry.retryTimer) {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  }
}

/** Settle every waiter: resolve on `err === null`, reject otherwise. */
export function settleWaiters(entry: SocketEntry, err: Error | null): void {
  const waiters = entry.waiters;
  entry.waiters = [];
  for (const w of waiters) {
    if (w.timer) clearTimeout(w.timer);
    if (err) w.reject(err);
    else w.resolve();
  }
}

/** Reject only the `failFast` waiters; the rest keep waiting on the supervisor. */
export function rejectImpatient(entry: SocketEntry, err: Error): void {
  const impatient = entry.waiters.filter((w) => w.failFast);
  entry.waiters = entry.waiters.filter((w) => !w.failFast);
  for (const w of impatient) {
    if (w.timer) clearTimeout(w.timer);
    w.reject(err);
  }
}

/** A promise that settles with the entry's next handshake, or rejects after `timeoutMs`. */
export function addWaiter(entry: SocketEntry, timeoutMs: number, failFast: boolean): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = { resolve, reject, timer: null, failFast };
    waiter.timer = setTimeout(() => {
      entry.waiters = entry.waiters.filter((w) => w !== waiter);
      reject(new Error(`relay ${entry.url} unreachable (${entry.lastError ?? entry.connection})`));
    }, timeoutMs);
    entry.waiters.push(waiter);
  });
}

/** `min(baseMs * 2^(attempt-1), maxMs)` with +-`jitter`; `random` in [0, 1). */
export function retryDelay(attempt: number, backoff: BackoffPolicy, random: number): number {
  const { baseMs, maxMs, jitter } = backoff;
  const base = Math.min(baseMs * 2 ** (attempt - 1), maxMs);
  return Math.round(base * (1 - jitter + random * 2 * jitter));
}

/**
 * The socket the budget closes first: nobody holds it and nothing is in
 * flight; inside its grace window before not; least recently used first.
 */
export function evictionVictim(entries: readonly SocketEntry[]): SocketEntry | undefined {
  return entries
    .filter((e) => !isWanted(e) && e.busy === 0)
    .sort((a, b) => {
      const ag = a.graceTimer ? 0 : 1;
      const bg = b.graceTimer ? 0 : 1;
      if (ag !== bg) return ag - bg;
      return a.lastUsedAt - b.lastUsedAt;
    })[0];
}
