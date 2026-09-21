'use client';

/**
 * Live status for the social relay set.
 *
 * Settings could tell you a relay URL was *syntactically* valid and nothing
 * else — not whether it was reachable, answering, or contributing anything.
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
 */

import { normalizeRelayUrl } from './relays';
import { poolEvents, socialPool } from './pool';

export type RelayState =
  | 'unknown'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'offline';

export type RelayStatus = {
  url: string;
  state: RelayState;
  /** Round-trip of a cheap bounded query, once measured. */
  latencyMs: number | null;
  /** Events this relay delivered, from the pool's own attribution. */
  notes: number;
  lastChange: number;
};

/** Long enough to ride out a reconnect, short enough to still feel live. */
export const FAILURE_SOAK_MS = 4000;
const PROBE_TIMEOUT_MS = 6000;
const RECONCILE_MS = 5000;

type Listener = (statuses: Record<string, RelayStatus>) => void;

const statuses = new Map<string, RelayStatus>();
const listeners = new Set<Listener>();
const pendingFailure = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Cached because `useSyncExternalStore` compares snapshots by identity: a
 * fresh object on every `getSnapshot()` call is an infinite render loop, not
 * a slow one. Invalidated only when something actually changed.
 */
let cachedSnapshot: Record<string, RelayStatus> = {};
let snapshotDirty = true;

function snapshot(): Record<string, RelayStatus> {
  if (snapshotDirty) {
    cachedSnapshot = Object.fromEntries(statuses);
    snapshotDirty = false;
  }
  return cachedSnapshot;
}

function emit(): void {
  snapshotDirty = true;
  const value = snapshot();
  listeners.forEach((listener) => listener(value));
}

function ensureEntry(url: string): RelayStatus {
  const existing = statuses.get(url);
  if (existing) return existing;
  const created: RelayStatus = {
    url,
    state: 'unknown',
    latencyMs: null,
    notes: 0,
    lastChange: Date.now(),
  };
  statuses.set(url, created);
  return created;
}

function patch(url: string, next: Partial<RelayStatus>): void {
  const key = normalizeRelayUrl(url) ?? url;
  const current = ensureEntry(key);
  const merged = { ...current, ...next, url: key };
  if (
    merged.state === current.state
    && merged.latencyMs === current.latencyMs
    && merged.notes === current.notes
  ) return;
  statuses.set(key, { ...merged, lastChange: Date.now() });
  emit();
}

/** Cancel a pending failure — the relay came back before the soak expired. */
function clearPendingFailure(url: string): void {
  const timer = pendingFailure.get(url);
  if (timer) {
    clearTimeout(timer);
    pendingFailure.delete(url);
  }
}

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
  if (pendingFailure.has(key)) return;
  pendingFailure.set(key, setTimeout(() => {
    pendingFailure.delete(key);
    patch(key, { state: isOffline() ? 'offline' : 'failed', latencyMs: null });
  }, FAILURE_SOAK_MS));
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Collapse every row to "offline" rather than reporting N independent
 * failures — the network is the fault, not the relays.
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
 * so this needs no instrumentation of the read path — and it's the honest
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
  // An empty map means the pool holds no relays at all — which happens before
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
  // That's not a failure — it's just unused — so don't report one.
  for (const [url, status] of statuses) {
    if (status.state === 'connected' && !connection.has(url)) {
      patch(url, { state: 'unknown' });
    }
  }
}

let watching = false;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;

/** Begin tracking `relays`. Idempotent; safe to call on every settings render. */
export function watchRelays(relays: readonly string[]): void {
  const keys = relays.map((url) => normalizeRelayUrl(url)).filter((url): url is string => !!url);

  // Drop rows for relays the user removed.
  for (const url of [...statuses.keys()]) {
    if (!keys.includes(url)) {
      clearPendingFailure(url);
      statuses.delete(url);
      snapshotDirty = true;
    }
  }
  keys.forEach((url) => {
    if (!statuses.has(url)) snapshotDirty = true;
    ensureEntry(url);
  });
  if (snapshotDirty) emit();

  if (!watching) {
    watching = true;
    poolEvents.onConnect = markConnected;
    poolEvents.onFailure = markFailed;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => applyOffline(false));
      window.addEventListener('offline', () => applyOffline(true));
    }
    reconcileTimer = setInterval(reconcileCounts, RECONCILE_MS);
  }

  keys.forEach((url) => {
    if (statuses.get(url)?.state === 'unknown') void probeRelay(url);
  });
}

export function subscribeRelayStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getRelayStatuses(): Record<string, RelayStatus> {
  return snapshot();
}

/** Test helper. */
export function _resetRelayStatus(): void {
  statuses.clear();
  snapshotDirty = true;
  listeners.clear();
  pendingFailure.forEach((timer) => clearTimeout(timer));
  pendingFailure.clear();
  if (reconcileTimer) clearInterval(reconcileTimer);
  reconcileTimer = null;
  watching = false;
}

/**
 * The whole relay set as one line.
 *
 * Status was only visible inside relay settings, which is the one place you
 * go *after* you already suspect something is wrong. This is the version
 * that fits in a toolbar: how many of your relays are answering, and the
 * worst state among them, which is what decides the colour.
 */
export type RelaySummary = {
  total: number;
  connected: number;
  state: RelayState;
};

export function relayStatusSummary(
  relays: readonly string[],
  statuses: Record<string, RelayStatus>,
): RelaySummary {
  const total = relays.length;
  let connected = 0;
  let anyFailed = false;
  let anyOffline = false;
  let anyPending = false;

  for (const relay of relays) {
    const url = normalizeRelayUrl(relay);
    const status = url ? statuses[url] : undefined;
    switch (status?.state) {
      case 'connected': connected += 1; break;
      case 'failed': anyFailed = true; break;
      case 'offline': anyOffline = true; break;
      default: anyPending = true; break;
    }
  }

  // Offline beats everything: N relays failing because the laptop's wifi
  // dropped is one problem, not N.
  const state: RelayState = anyOffline
    ? 'offline'
    : total === 0
      ? 'unknown'
      : connected === total
        ? 'connected'
        : connected > 0
          // Partial connectivity still reads green — the feed works. The
          // count next to it is what says "not all of them".
          ? 'connected'
          : anyFailed
            ? 'failed'
            : anyPending
              ? 'connecting'
              : 'unknown';

  return { total, connected, state };
}
