'use client';

/**
 * Live status for the social relay set.
 *
 * Settings could tell you a relay URL was *syntactically* valid and nothing
 * else: not whether it was reachable, answering, or contributing anything.
 * A relay list you can't see the state of is a list you can't debug.
 *
 * Three sources, because no single one is sufficient:
 *
 *  - **Connection callbacks** on the pool give real transitions, but only
 *    fire when something actually connects.
 *  - **An active probe** (`ensureRelay`) gives a relay you just typed an
 *    immediate verdict instead of leaving it "unknown" until some query
 *    happens to use it. `SimplePool.subscribe` is lazy, so subscribing alone
 *    would make every relay look fine.
 *  - **A slow reconcile** against `listConnectionStatus()` catches drops the
 *    callbacks missed, and notices relays the pool pruned for idleness.
 *
 * Borrowed from the bridge's `setRelayAccess`: a **soak** before reporting a
 * failure, so a transient blip doesn't flash the row red, and no downgrade
 * from `connected` without evidence.
 *
 * The rows, listeners and soak timers live in `relay-status-store.ts`; the
 * one-line summary in `relay-summary.ts`. Both are re-exported here, so this
 * stays the one import.
 */

import { normalizeRelayUrl } from '@/utils/social/relay-url';
import { poolEvents, socialPool } from './pool';
import {
  addListener,
  clearPendingFailure,
  patch,
  resetStore,
  snapshot,
  soakFailure,
  statuses,
  syncEntries,
  type RelayStatus,
  type RelayStatusListener,
} from './relay-status-store';
import { FAILURE_SOAK_MS } from '@/constants/social/relay-status';

export type { RelayState, RelayStatus } from './relay-status-store';
export { relayStatusSummary, type RelaySummary } from './relay-summary';

const PROBE_TIMEOUT_MS = 6000;
const RECONCILE_MS = 5000;

export function markConnected(url: string): void {
  const key = normalizeRelayUrl(url) ?? url;
  clearPendingFailure(key);
  patch(key, { state: 'connected' });
}

/**
 * Failures soak. A relay that drops and reconnects within the window never
 * shows as failed, which is the difference between an honest indicator and a
 * flickering one.
 */
export function markFailed(url: string): void {
  const key = normalizeRelayUrl(url) ?? url;
  soakFailure(key, FAILURE_SOAK_MS, () => {
    patch(key, { state: isOffline() ? 'offline' : 'failed', latencyMs: null });
  });
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Collapse every row to "offline" rather than reporting N independent
 * failures: the network is the fault, not the relays.
 */
function applyOffline(offline: boolean): void {
  for (const [url, status] of statuses) {
    if (offline) {
      clearPendingFailure(url);
      patch(url, { state: 'offline', latencyMs: null });
    } else if (status.state === 'offline') {
      patch(url, { state: 'unknown' });
    }
  }
}

/**
 * Actively connect and time a cheap query, so a relay just added in Settings
 * reports immediately instead of sitting unknown.
 */
export async function probeRelay(url: string): Promise<void> {
  const key = normalizeRelayUrl(url);
  if (!key) return;
  if (isOffline()) {
    patch(key, { state: 'offline' });
    return;
  }
  patch(key, { state: 'connecting' });
  const started = Date.now();
  try {
    const pool = socialPool();
    const relay = await pool.ensureRelay(key, { connectionTimeout: PROBE_TIMEOUT_MS });
    if (!relay?.connected) {
      markFailed(key);
      return;
    }
    clearPendingFailure(key);
    patch(key, { state: 'connected', latencyMs: Date.now() - started });
  } catch {
    markFailed(key);
  }
}

/**
 * How many events each relay delivered.
 *
 * `pool.seenOn` already attributes every event to the relays that served it,
 * so this needs no instrumentation of the read path, and it's the honest
 * measure of whether a relay is earning its slot.
 */
function reconcileCounts(): void {
  const pool = socialPool() as unknown as {
    seenOn?: Map<string, Set<{ url?: string }>>;
    listConnectionStatus?: () => Map<string, boolean>;
  };

  const counts = new Map<string, number>();
  for (const relays of pool.seenOn?.values() ?? []) {
    for (const relay of relays) {
      const key = normalizeRelayUrl(relay?.url ?? '');
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const [url, notes] of counts) patch(url, { notes });

  const connection = pool.listConnectionStatus?.();
  // An empty map means the pool holds no relays at all, which happens before
  // anything has connected. Treating that as "everything dropped" would wipe
  // state we just learned from the connection callbacks.
  if (!connection || connection.size === 0) return;
  for (const [rawUrl, connected] of connection) {
    const key = normalizeRelayUrl(rawUrl);
    if (!key || !statuses.has(key)) continue;
    if (connected) markConnected(key);
    else if (statuses.get(key)?.state === 'connected') markFailed(key);
  }
  // A relay the pool dropped for idleness is absent from the map entirely.
  // That's not a failure (it's just unused), so don't report one.
  for (const [url, status] of statuses) {
    if (status.state === 'connected' && !connection.has(url)) {
      patch(url, { state: 'unknown' });
    }
  }
}

/**
 * Re-probe rows that went quiet.
 *
 * `watchRelays` probes once, at mount. After that the only way a row moved
 * was a connection callback, and those only fire inside `subscribe`/
 * `publish`, so on a surface that reads no social data the sockets go idle,
 * the pool drops them, `reconcileCounts` demotes every row to `unknown`, and
 * the count sat at `0/N` for the rest of the session with nothing to bring
 * it back. Bounded and slow: this answers "is it still there", not "give me
 * a live heartbeat".
 */
const REPROBE_MS = 60_000;
let lastReprobe = 0;

function reprobeStale(): void {
  const now = Date.now();
  if (now - lastReprobe < REPROBE_MS) return;
  const stale = [...statuses.values()].filter((status) => status.state === 'unknown');
  if (stale.length === 0) return;
  lastReprobe = now;
  for (const status of stale) void probeRelay(status.url);
}

let watching = false;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;

/** Begin tracking `relays`. Idempotent; safe to call on every settings render. */
export function watchRelays(relays: readonly string[]): void {
  const keys = relays.map((url) => normalizeRelayUrl(url)).filter((url): url is string => !!url);

  // Drop rows for relays the user removed; add the new ones.
  syncEntries(keys);

  if (!watching) {
    watching = true;
    poolEvents.onConnect = markConnected;
    poolEvents.onFailure = markFailed;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => applyOffline(false));
      window.addEventListener('offline', () => applyOffline(true));
    }
    reconcileTimer = setInterval(() => {
      reconcileCounts();
      reprobeStale();
    }, RECONCILE_MS);
  }

  keys.forEach((url) => {
    if (statuses.get(url)?.state === 'unknown') void probeRelay(url);
  });
}

export function subscribeRelayStatus(listener: RelayStatusListener): () => void {
  return addListener(listener);
}

export function getRelayStatuses(): Record<string, RelayStatus> {
  return snapshot();
}

/** Test helper. */
export function _resetRelayStatus(): void {
  resetStore();
  if (reconcileTimer) clearInterval(reconcileTimer);
  reconcileTimer = null;
  watching = false;
  lastReprobe = 0;
}
