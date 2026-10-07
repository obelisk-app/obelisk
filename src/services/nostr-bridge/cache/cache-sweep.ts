/**
 * The bridgeCache operations that scan localStorage: freeing space on a
 * quota error, deleting by prefix, the logout wipe, and the id listings the
 * cold-load seed reads. Moved from `cache.ts`, which re-exports them.
 */
import { buildKey, isAvailable } from './cache-keys';
import { KEY_PREFIX, LEGACY_KEY_PREFIXES } from '@/constants/nostr-bridge/cache';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

/**
 * Evict the oldest half of all bridgeCache entries (by write time `t`).
 *
 * Called when a localStorage write anywhere on the origin hits the quota.
 * The bridgeCache is the one namespace that is safe to sacrifice, it is
 * stale-while-revalidate by contract, so the relay repopulates anything
 * evicted, and it is also the namespace that grows: kind-0 profile
 * entries accrue one per pubkey per relay with no count cap, and per-relay
 * caches deliberately survive relay switches. Evicting by oldest write
 * time drops dormant relays/channels first; the active channel's entries
 * are rewritten on every burst and stay fresh.
 *
 * Returns true when at least one entry was removed (the caller may retry
 * its write), false when there was nothing to evict.
 */
export function cacheFreeSpaceForQuota(): boolean {
  if (!isAvailable()) return false;
  try {
    const entries: Array<{ key: string; t: number }> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      // Storable shape is `{"v":...,"t":<ms>}`, cheap tail extraction
      // instead of JSON.parse; a full parse of every entry on a quota
      // event would block the main thread on exactly the payloads that
      // caused the problem. Unparseable entries sort first (evicted).
      const m = raw ? /"t":(\d+)\}$/.exec(raw.slice(-24)) : null;
      entries.push({ key, t: m ? Number(m[1]) : 0 });
    }
    if (entries.length === 0) return false;
    entries.sort((a, b) => a.t - b.t);
    const evict = entries.slice(0, Math.max(1, Math.ceil(entries.length / 2)));
    for (const { key } of evict) {
      try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete one or more entries. Calling shapes:
 *   - `cacheDelete(relay, kind, id)`     → single entry
 *   - `cacheDelete(relay, kind)`         → wipe all ids for that relay+kind
 *   - `cacheDelete(relay)`               → wipe all entries for that relay
 */
export function cacheDelete(relay: string, kind?: number, id?: string): void {
  if (!isAvailable()) return;
  if (kind !== undefined && id !== undefined) {
    try { window.localStorage.removeItem(buildKey(relay, kind, id)); } catch { /* ignore */ }
    return;
  }
  // Prefix wipe: enumerate keys and remove matches.
  const prefix = kind !== undefined
    ? `${KEY_PREFIX}${normalizeRelayUrl(relay)}/${kind}/`
    : `${KEY_PREFIX}${normalizeRelayUrl(relay)}/`;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) toRemove.push(key);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/**
 * Wipe every cache entry (any relay, any kind). Used on logout, leaving
 * cached data on disk after a session ends would let the next user briefly
 * see the previous identity's admin/member lists.
 */
export function cacheClearAll(): void {
  if (!isAvailable()) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(KEY_PREFIX) || LEGACY_KEY_PREFIXES.some((p) => key.startsWith(p))) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/**
 * Enumerate cached ids for a relay+kind. Used during bridge construction to
 * seed in-memory stores without knowing the id list ahead of time.
 *
 * Returns ids only, callers `cacheGet` each one to pull the value. This
 * keeps the function cheap to scan (no JSON.parse) and avoids a giant
 * payload in memory all at once.
 */
export function cacheListIds(relay: string, kind: number): string[] {
  return cacheListIdsByKind(relay, [kind]).get(kind) ?? [];
}

/** Index several cached kinds with one localStorage scan. */
export function cacheListIdsByKind(relay: string, kinds: readonly number[]): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (!isAvailable() || kinds.length === 0) return result;
  const wanted = new Set(kinds);
  const prefix = `${KEY_PREFIX}${normalizeRelayUrl(relay)}/`;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      const slash = suffix.indexOf('/');
      if (slash < 1) continue;
      const kind = Number(suffix.slice(0, slash));
      if (!wanted.has(kind)) continue;
      const ids = result.get(kind) ?? [];
      ids.push(suffix.slice(slash + 1));
      result.set(kind, ids);
    }
  } catch {
    // ignore
  }
  return result;
}
