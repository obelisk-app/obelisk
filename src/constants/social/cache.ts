/**
 * Social: cache. Values the code in `services/social/cache.ts` reads, kept
 * here so every reader imports the one copy.
 */

import type { FeedCacheId } from '@/services/social/cache';

/**
 * Keep this well below the in-memory `FEED_MAX_NOTES`. localStorage is a
 * shared, quota-limited origin resource (the kind-0 profile blob already
 * competes for it), and 50 notes is plenty to fill a viewport instantly
 * while the live query catches up.
 */
export const FEED_CACHE_LIMIT = 50;

/**
 * Bumped when a previous version could have written wrong data.
 *
 * v2: before the `noteMatchesSource` guard existed, the shared coalescer fed
 * other consumers' events into the Following feed, and those strangers were
 * written straight to this cache. Since the cache is painted on every mount
 * and `mergeNotes` only ever adds, a poisoned entry was permanent: a
 * correct fetch could not evict it. Changing the id abandons those entries.
 */
export const FEED_CACHE_VERSION = 'v2';

export const FOLLOWING_FEED_ID = `feed:${FEED_CACHE_VERSION}:following` as FeedCacheId;

export const GLOBAL_FEED_ID = `feed:${FEED_CACHE_VERSION}:global` as FeedCacheId;

/** Bound resolved reply/reference previews, including negative results. */
export const NOTE_PREVIEW_CACHE_LIMIT = 500;
