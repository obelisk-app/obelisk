'use client';

/**
 * The hook every feed surface uses. Owns the lifecycle that used to be
 * open-coded (and wrong) inside `NostrProfile`:
 *
 *   1. Seed from localStorage synchronously, BEFORE first paint, so
 *      re-opening a feed is instant instead of a three-skeleton wait.
 *   2. Fetch a page from the relays and merge.
 *   3. Keep a live tail open for new notes.
 *   4. Write through to the cache, debounced.
 *   5. `loadMore()` pages backwards with `until`.
 *
 * The old component kept notes in `useState` with a `key={pubkey:relays}`
 * remount, so every navigation threw the list away and refetched from zero.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useLayoutEffect } from 'react';
import { useModerationStore } from '@/store/moderation';
import {
  FEED_PAGE_SIZE,
  applyModeration,
  loadFollowingFeed,
  loadGlobalFeed,
  loadProfileFeed,
  mergeNotes,
  nextCursor,
} from './feed';
import { profileFeedId, readFeedCache, writeFeedCache, type FeedCacheId } from './cache';
import { ensureCounts } from './engagement';
import { FEED_KINDS } from './kinds';
import { subscribeSocial } from './pool';
import { dedupeReposts } from './repost';

export type FeedSource =
  | { kind: 'following'; authors: readonly string[] }
  | { kind: 'global' }
  | { kind: 'profile'; pubkey: string };

export type FeedState = {
  notes: NostrEvent[];
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  exhausted: boolean;
  /** Notes that arrived on the live tail while the user is scrolled away. */
  pendingCount: number;
  refresh: () => void;
  loadMore: () => void;
  /** Merge the live-tail buffer into the visible list. */
  showPending: () => void;
};

function cacheIdFor(source: FeedSource): FeedCacheId {
  if (source.kind === 'profile') return profileFeedId(source.pubkey);
  return source.kind === 'following' ? 'feed:following' : 'feed:global';
}

function sourceKey(source: FeedSource): string {
  if (source.kind === 'profile') return `profile:${source.pubkey}`;
  if (source.kind === 'global') return 'global';
  return `following:${source.authors.length}`;
}

async function fetchPage(
  source: FeedSource,
  relays: readonly string[],
  until?: number,
): Promise<NostrEvent[]> {
  if (source.kind === 'profile') {
    return loadProfileFeed(source.pubkey, { until, relays, limit: FEED_PAGE_SIZE });
  }
  if (source.kind === 'following') {
    return loadFollowingFeed(source.authors, { until, relays, limit: FEED_PAGE_SIZE });
  }
  return loadGlobalFeed({ until, relays, limit: FEED_PAGE_SIZE });
}

export function useFeed(source: FeedSource, relays: readonly string[]): FeedState {
  const cacheId = cacheIdFor(source);
  const key = `${sourceKey(source)}|${relays.join(',')}`;
  const relayList = useMemo(() => [...relays], [relays.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const [notes, setNotes] = useState<NostrEvent[]>([]);
  const [pending, setPending] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [nonce, setNonce] = useState(0);

  const seededKey = useRef<string | null>(null);
  const liveRef = useRef(false);

  // Seed before paint. useLayoutEffect (not useEffect) is what makes the
  // cached notes appear in the FIRST frame rather than causing a flash of
  // skeletons followed by content.
  useLayoutEffect(() => {
    if (seededKey.current === key) return;
    seededKey.current = key;
    const cached = readFeedCache(relayList, cacheId);
    setNotes(cached);
    setPending([]);
    setExhausted(false);
    setLoading(cached.length === 0);
  }, [key, cacheId, relayList]);

  // Fetch the first page (and re-fetch on refresh()).
  useEffect(() => {
    let cancelled = false;
    const following = source.kind === 'following' ? source.authors : null;
    if (following && following.length === 0) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    setError(false);
    fetchPage(source, relayList)
      .then((page) => {
        if (cancelled) return;
        setNotes((current) => {
          const merged = dedupeReposts(mergeNotes(current, page));
          writeFeedCache(relayList, cacheId, merged);
          return merged;
        });
        setLoading(false);
        if (page.length === 0) setExhausted(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        // Only surface an error when there's nothing to show. With cached
        // notes on screen, a failed refresh is not worth an error state.
        setNotes((current) => {
          if (current.length === 0) setError(true);
          return current;
        });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  // Live tail — new notes only (since "now"), buffered so the list doesn't
  // jump under a reading user.
  useEffect(() => {
    const following = source.kind === 'following' ? source.authors : null;
    if (following && following.length === 0) return;
    liveRef.current = true;
    const since = Math.floor(Date.now() / 1000);
    const filters = source.kind === 'profile'
      ? [{ kinds: FEED_KINDS, authors: [source.pubkey], since }]
      : following
        ? [{ kinds: FEED_KINDS, authors: [...following].slice(0, 300), since }]
        : [{ kinds: FEED_KINDS, since }];
    const stop = subscribeSocial(filters, (event) => {
      if (!liveRef.current) return;
      setPending((current) => (
        current.some((note) => note.id === event.id) ? current : [event, ...current]
      ));
    }, { relays: relayList });
    return () => {
      liveRef.current = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Engagement counts for whatever is on screen.
  useEffect(() => {
    if (notes.length === 0) return;
    void ensureCounts(notes.slice(0, 40).map((note) => note.id));
  }, [notes]);

  const loadMore = useCallback(() => {
    if (loadingMore || exhausted) return;
    const until = nextCursor(notes);
    if (until === undefined) return;
    setLoadingMore(true);
    fetchPage(source, relayList, until)
      .then((page) => {
        setNotes((current) => {
          const merged = dedupeReposts(mergeNotes(current, page));
          // A page that adds nothing new means we've reached the end of what
          // these relays will serve — `until` overlap guarantees at least the
          // boundary note comes back, so "no growth" is the honest signal.
          if (merged.length === current.length) setExhausted(true);
          writeFeedCache(relayList, cacheId, merged);
          return merged;
        });
      })
      .catch(() => setExhausted(true))
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, loadingMore, exhausted, key, cacheId]);

  const showPending = useCallback(() => {
    setPending((buffered) => {
      if (buffered.length === 0) return buffered;
      setNotes((current) => {
        const merged = dedupeReposts(mergeNotes(current, buffered));
        writeFeedCache(relayList, cacheId, merged);
        return merged;
      });
      return [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayList, cacheId]);

  const refresh = useCallback(() => {
    setExhausted(false);
    setNonce((n) => n + 1);
  }, []);

  const isMuted = useModerationStore((state) => state.isMuted);
  const isBlocked = useModerationStore((state) => state.isBlocked);
  const visible = useMemo(
    () => applyModeration(notes, (pubkey) => isMuted(pubkey) || isBlocked(pubkey)),
    [notes, isMuted, isBlocked],
  );

  return {
    notes: visible,
    loading,
    loadingMore,
    error,
    exhausted,
    pendingCount: pending.length,
    refresh,
    loadMore,
    showPending,
  };
}
