/**
 * Tiny stale-while-revalidate cache for relay-derived state.
 *
 * Why this exists: the bridge re-fetches everything from the relay on every
 * page load. For data that's small and rarely-changing (admin/member lists,
 * profile metadata, channel layout, relay branding), the round-trip is
 * latency the user feels, even after the login-race fix lands. Painting
 * stale-but-correct values from disk while the relay re-confirms makes the
 * sidebar appear instantly on reload.
 *
 * Contract:
 *   - Stale-while-revalidate. Callers `cacheGet` for instant paint, then
 *     let the live relay subscription overwrite the in-memory store via the
 *     usual `StateStore.update` path. There is no TTL, relays are the
 *     source of truth and arriving events monotonically replace the cache
 *     via `cacheSet`.
 *   - Keyed by `relay + kind + id`. The relay scoping prevents cross-relay
 *     leakage (a server's admin list is meaningful only for that relay).
 *   - localStorage-backed. Synchronous, ~5MB cap per origin. Entries stay
 *     small by capping the cached window per kind (MESSAGE_CACHE_LIMIT,
 *     REACTION_CACHE_LIMIT in client.ts); even a heavy account with 20+
 *     channels stays well under quota.
 *   - Invalidation: explicit only. {@link cacheClearAll} on logout.
 *     {@link cacheDelete} for surgical removal. We deliberately do NOT
 *     invalidate on relay-switch, caches for the previous relay stay on
 *     disk and re-paint instantly if the user switches back.
 *
 * Currently wired (every entry pairs an ingest writer with a seed reader):
 *   - kind 0             (user profile)        , `client.ts:ingestUserMetadata` + `seedCacheForRelay`
 *   - kind 7             (reactions)           , `client.ts:ingestReaction` (debounced) + `seedCacheForRelay`
 *   - kind 9             (group messages)      , `client.ts:ingestMessage` (debounced) + `seedCacheForRelay`
 *   - kind 9007          (group creators)      , `client.ts:ingestGroupCreator` + `seedCacheForRelay`
 *   - kind 39000         (group metadata)      , `client.ts:ingestGroupMetadata` + `seedCacheForRelay`
 *   - kind 39001 / 39002 (admin/member lists)  , `client.ts:ingestAdminMember` + `seedCacheForRelay`
 *   - kind 30078 layout   (channel layout)     , `channel-layout.ts:subscribeLayout`
 *   - kind 30078 branding (relay branding)     , `relay-branding.ts:subscribeBranding`
 *   - kind 2390          (game logs, per table), `games/cache.ts` (debounced) + `seedGameFromCache`
 *
 * Deliberately NOT cached:
 *   - kind 4 DMs, already persisted by the DM store with its own per-account key.
 *
 * Note on game logs: keyed per table rather than per channel, because a
 * `GameCard` knows its table id and nothing else, that is what lets it seed
 * itself synchronously before its first paint. Stacker `checkpoint` events are
 * omitted from the write entirely (never stripped of their `inputs`/`board`
 * blobs, the store dedupes by event id, so a stripped copy would permanently
 * shadow the real one), and a table whose remaining log exceeds
 * GAME_CACHE_EVENT_LIMIT is skipped rather than truncated. See
 * `src/services/games/cache.ts`.
 *
 * Note on messages + reactions: the on-disk window is the last
 * MESSAGE_CACHE_LIMIT messages and REACTION_CACHE_LIMIT reactions per
 * channel (50 and 500 respectively today). The live REQ still runs and
 * its echoes overwrite the in-memory store; the cache exists purely to
 * give the chat pane something to paint before the relay round-trips.
 */
import { buildKey, isAvailable } from './cache-keys';
import { KEY_PREFIX, LEGACY_KEY_PREFIXES } from '@/constants/nostr-bridge/cache';
import { cacheFreeSpaceForQuota } from './cache-sweep';

export { cacheClearAll, cacheDelete, cacheFreeSpaceForQuota, cacheListIds, cacheListIdsByKind } from './cache-sweep';

export interface CachedEntry<T> {
  readonly value: T;
  readonly createdAt: number;
  readonly relay: string;
  readonly kind: number;
  readonly id: string;
}

interface Storable<T> {
  v: T;
  /** Wall-clock ms when cacheSet was called. Used for telemetry only. */
  t: number;
}

/**
 * Read a cached entry. Returns `null` when:
 *   - localStorage is unavailable (SSR)
 *   - the key was never written
 *   - the stored payload failed to parse (corruption, silently dropped)
 */
export function cacheGet<T>(relay: string, kind: number, id: string): CachedEntry<T> | null {
  if (!isAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(buildKey(relay, kind, id));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Storable<T>;
    if (typeof parsed !== 'object' || parsed === null || !('v' in parsed) || !('t' in parsed)) {
      return null;
    }
    return {
      value: parsed.v,
      createdAt: parsed.t,
      relay,
      kind,
      id,
    };
  } catch {
    return null;
  }
}

/**
 * Write a cached entry. Quietly no-ops if localStorage throws (quota, private
 * browsing, etc.), the live store is still authoritative; cache is a UX
 * optimization, not durability.
 */
export function cacheSet<T>(relay: string, kind: number, id: string, value: T): void {
  if (!isAvailable()) return;
  try {
    const key = buildKey(relay, kind, id);
    const valueJson = JSON.stringify(value);
    if (valueJson === undefined) return;

    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      try {
        const existing = JSON.parse(raw) as Storable<T>;
        if (
          existing
          && typeof existing === 'object'
          && 'v' in existing
          && JSON.stringify(existing.v) === valueJson
        ) {
          return;
        }
      } catch {
        // Corrupt entries are overwritten below.
      }
    }

    const stored = `{"v":${valueJson},"t":${Date.now()}}`;
    try {
      window.localStorage.setItem(key, stored);
    } catch {
      // Quota exceeded, evict the oldest cache entries and retry once.
      // Without this the cache pins localStorage at the brim forever and
      // every OTHER writer on the origin (read cursors, session) starts
      // failing on writes it can't afford to lose.
      if (cacheFreeSpaceForQuota()) window.localStorage.setItem(key, stored);
    }
  } catch {
    // Private mode, storage disabled, retry failed, degrade silently.
  }
}

// One-shot eviction of legacy cache entries on module load. Each version
// bump leaves the previous prefix orphaned; this clears it (and any older
// generations) so stale data, including entries written by the pre-bleed-fix
// bridge under the wrong relay's key, can't keep painting after the upgrade.
// Idempotent: once nothing matches a legacy prefix, the loop exits cheaply.
(function evictLegacyCache() {
  if (!isAvailable()) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(KEY_PREFIX)) continue;
      if (LEGACY_KEY_PREFIXES.some((p) => key.startsWith(p))) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
})();
