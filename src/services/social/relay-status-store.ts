/**
 * The state behind `relay-status.ts`: one row per watched social relay, the
 * listeners, the identity-stable snapshot `useSyncExternalStore` reads, and
 * the pending-failure soak timers. No network here; the probing and
 * reconciling that move rows live in `relay-status.ts`.
 */
import { normalizePublicRelayUrl } from '@/utils/relay-url/public-relay';

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

export type RelayStatusListener = (statuses: Record<string, RelayStatus>) => void;

/** Every watched row, keyed by normalized URL. Read-only outside this file by convention. */
export const statuses = new Map<string, RelayStatus>();
const listeners = new Set<RelayStatusListener>();
const pendingFailure = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Cached because `useSyncExternalStore` compares snapshots by identity: a
 * fresh object on every `getSnapshot()` call is an infinite render loop, not
 * a slow one. Invalidated only when something actually changed.
 */
let cachedSnapshot: Record<string, RelayStatus> = {};
let snapshotDirty = true;

export function snapshot(): Record<string, RelayStatus> {
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

export function addListener(listener: RelayStatusListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
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

export function patch(url: string, next: Partial<RelayStatus>): void {
  const key = normalizePublicRelayUrl(url) ?? url;
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

/** Cancel a pending failure: the relay came back before the soak expired. */
export function clearPendingFailure(url: string): void {
  const timer = pendingFailure.get(url);
  if (timer) {
    clearTimeout(timer);
    pendingFailure.delete(url);
  }
}

/** Start a failure soak for `url` unless one is already running; `fire` runs when it expires. */
export function soakFailure(url: string, ms: number, fire: () => void): void {
  if (pendingFailure.has(url)) return;
  pendingFailure.set(url, setTimeout(() => {
    pendingFailure.delete(url);
    fire();
  }, ms));
}

/** Make the rows exactly `keys`: drop removed relays, add new ones as unknown, emit once if anything changed. */
export function syncEntries(keys: readonly string[]): void {
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
}

export function resetStore(): void {
  statuses.clear();
  snapshotDirty = true;
  listeners.clear();
  pendingFailure.forEach((timer) => clearTimeout(timer));
  pendingFailure.clear();
}
