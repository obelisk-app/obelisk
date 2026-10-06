/**
 * What a feed is a feed *of*, and the plain functions `useFeed` keys,
 * caches, pages and tails by. No React here.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { FEED_PAGE_SIZE, loadFollowingFeed, loadGlobalFeed, loadProfileFeed } from './feed';
import { FOLLOWING_FEED_ID, GLOBAL_FEED_ID, profileFeedId, type FeedCacheId } from './cache';
import { kindsForFilter, type ContentFilter } from './kinds';

export type FeedSource =
  | { kind: 'following'; authors: readonly string[] }
  | { kind: 'global' }
  | { kind: 'profile'; pubkey: string };

export function cacheIdFor(source: FeedSource): FeedCacheId {
  if (source.kind === 'profile') return profileFeedId(source.pubkey);
  return source.kind === 'following' ? FOLLOWING_FEED_ID : GLOBAL_FEED_ID;
}

/**
 * Cheap content fingerprint of a follow list.
 *
 * Keying on `authors.length` alone meant following one person and unfollowing
 * another produced the same key, so the feed never refetched and the live
 * tail kept filtering against the old set. Recomputed only when the array
 * identity changes, so the O(n) walk is not per-render.
 */
export function authorsFingerprint(authors: readonly string[]): string {
  let hash = 0;
  for (const author of authors) {
    for (let i = 0; i < author.length; i += 8) {
      hash = (Math.imul(hash, 31) + author.charCodeAt(i)) | 0;
    }
  }
  return `${authors.length}:${(hash >>> 0).toString(36)}`;
}

export function sourceKey(source: FeedSource): string {
  if (source.kind === 'profile') return `profile:${source.pubkey}`;
  if (source.kind === 'global') return 'global';
  return `following:${authorsFingerprint(source.authors)}`;
}

export async function fetchPage(
  source: FeedSource,
  relays: readonly string[],
  until?: number,
  filter: ContentFilter = 'all',
): Promise<NostrEvent[]> {
  if (source.kind === 'profile') {
    // The filter reaches the REQ here too now: a profile's articles and
    // pictures were invisible while the loader was kind-1 only.
    return loadProfileFeed(source.pubkey, { until, relays, limit: FEED_PAGE_SIZE, filter });
  }
  if (source.kind === 'following') {
    return loadFollowingFeed(source.authors, { until, relays, limit: FEED_PAGE_SIZE, filter });
  }
  return loadGlobalFeed({ until, relays, limit: FEED_PAGE_SIZE, filter });
}

/** The live-tail REQ for a source: new notes only, from `since` on. */
export function liveTailFilters(source: FeedSource, filter: ContentFilter, since: number): Filter[] {
  const kinds = kindsForFilter(filter);
  if (source.kind === 'profile') return [{ kinds, authors: [source.pubkey], since }];
  if (source.kind === 'following') return [{ kinds, authors: [...source.authors].slice(0, 300), since }];
  return [{ kinds, since }];
}
