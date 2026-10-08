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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { filterForSource, noteMatchesSource, mergeNotes, nextCursor } from '@/services/social/feed';
import { widenedRelays } from '@/services/social/relays';
import { readFeedCache, writeFeedCache } from '@/services/social/cache';
import type { ContentFilter } from '@/services/social/kinds';
import type { FeedSort } from '@/services/social/rank';
import { subscribeSocial } from '@/services/social/pool';
import { groupReposts } from '@/services/social/repost';
import { cacheIdFor, fetchPage, liveTailFilters, sourceKey, type FeedSource } from '@/services/social/feed-source';
import { useFeedSignals, useRankedFeed } from './useFeedRanking';
import { useKeyedValue } from '@/hooks/common/useKeyedValue';

export type { FeedSource } from '@/services/social/feed-source';

export type FeedState = {
  notes: NostrEvent[];
  /** Target note id → reposter pubkeys. Empty for notes nobody reposted. */
  repostersByTarget: Map<string, string[]>;
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

export function useFeed(
  source: FeedSource,
  relays: readonly string[],
  filter: ContentFilter = 'all',
  sort: FeedSort = 'recent',
  /**
   * Show highlights of Nostr events as their own rows. Off by default;
   * see `filterFeedHighlights`. Not part of the cache key: the REQ already
   * carries them, this only decides whether they are drawn.
   */
  showHighlights = false,
): FeedState {
  // Callers build `source` and `relays` fresh on every render. Held by their
  // keys, they keep one identity per feed, so they can sit in the dependency
  // lists below and an effect re-runs only when the feed itself changes.
  const relaysKey = relays.join(',');
  const relayList = useKeyedValue(relays, relaysKey);
  const feedSource = useKeyedValue(source, sourceKey(source));
  const cacheId = cacheIdFor(feedSource);
  // The filter is part of the key: a narrowed REQ returns a different page.
  // `sort` is NOT part of the key: it reorders the window we already have,
  // so changing it must not discard the page or refetch.
  const key = `${sourceKey(feedSource)}|${relaysKey}|${filter}`;
  // `authors` is `[]` both for "follows nobody" and "kind 3 hasn't arrived";
  // either way there is nothing to fetch, so the feed is not loading.
  const awaitingFollows = feedSource.kind === 'following' && feedSource.authors.length === 0;

  const [notes, setNotes] = useState<NostrEvent[]>([]);
  const [pending, setPending] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // The request that failed, so a refresh (a new request) clears the error
  // without a reset step.
  const [failedRequest, setFailedRequest] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [nonce, setNonce] = useState(0);

  const seededKey = useRef<string | null>(null);
  // A request belongs to this visit, not merely a feed key: navigating
  // away and back must not revive an older page. The ref also closes the
  // same-tick gap before React paints the loading flag.
  const pageRequest = useRef<symbol | null>(null);
  useLayoutEffect(() => () => { pageRequest.current = null; }, [key]);
  // Whether this feed has already fallen back to the wider relay set. Reset
  // with the feed key below: widening is per view, not per session.
  const widenedRef = useRef(false);
  // Built once per follow-list change rather than per delivered event: the
  // live tail can fire hundreds of times a minute on a busy relay set.
  const allowedAuthors = useMemo(
    () => (feedSource.kind === 'following' ? new Set(feedSource.authors) : undefined),
    [feedSource],
  );

  /**
   * Every cache write goes through here.
   *
   * The invariant is "this cache holds notes that belong to this feed", and
   * it has been broken twice by different paths: the coalescer's
   * over-delivery, then a page resolving after a tab switch. Enforcing it at
   * the single write point costs a filter over ≤50 notes and makes the
   * invariant true by construction rather than by every caller remembering.
   */
  const persist = useCallback((merged: readonly NostrEvent[]) => {
    // Same window as the seed: with no follows resolved yet, every note
    // would be filtered out and the entry overwritten with an empty list.
    if (awaitingFollows) return;
    writeFeedCache(
      relayList,
      cacheId,
      merged.filter((note) => noteMatchesSource(note, feedSource, allowedAuthors, filter)),
    );
  }, [awaitingFollows, relayList, cacheId, feedSource, allowedAuthors, filter]);

  // Seed before paint. useLayoutEffect (not useEffect) is what makes the
  // cached notes appear in the FIRST frame rather than causing a flash of
  // skeletons followed by content.
  useLayoutEffect(() => {
    if (seededKey.current === key) return;
    seededKey.current = key;

    /*
     * Filter the seed too. A cache written before the guard existed holds
     * strangers, and because it is painted on mount and `mergeNotes` only
     * adds, a correct fetch can never evict them.
     *
     * Except while the follow list is still in flight. `authors` is `[]`
     * both for "follows nobody" and "kind 3 hasn't arrived", and filtering
     * a cached Following feed against an empty set drops every note,
     * which is exactly when the cache is meant to earn its keep, on the
     * first paint after a reload. The entries were written by a session
     * that did know the follows, and the next seed (the key changes when
     * they land) re-filters against the real set.
     */
    const cached = readFeedCache(relayList, cacheId)
      .filter((note) => awaitingFollows || noteMatchesSource(note, feedSource, allowedAuthors, filter));
    setNotes(cached);
    setPending([]);
    setLoadingMore(false);
    setExhausted(false);
    widenedRef.current = false;
    setLoading(cached.length === 0);
  }, [key, cacheId, relayList, awaitingFollows, feedSource, allowedAuthors, filter]);

  // Fetch the first page (and re-fetch on refresh()).
  const request = `${key}#${nonce}`;
  useEffect(() => {
    if (awaitingFollows) return;
    let cancelled = false;
    fetchPage(feedSource, relayList, undefined, filter)
      .then((page) => {
        if (cancelled) return;
        setNotes((current) => {
          // Guard the page, not just the live tail: `fetchPage` reads through
          // the shared coalescer, which fans every consumer's events into
          // this handle. See `filterForSource`.
          const guarded = filterForSource(page, feedSource, allowedAuthors, filter);
          const merged = groupReposts(mergeNotes(current, guarded)).notes;
          persist(merged);
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
          if (current.length === 0) setFailedRequest(request);
          return current;
        });
      });
    return () => { cancelled = true; };
  }, [request, awaitingFollows, feedSource, relayList, filter, allowedAuthors, persist]);

  // Live tail: new notes only (since "now"), buffered so the list doesn't
  // jump under a reading user.
  useEffect(() => {
    if (awaitingFollows) return;
    let live = true;
    const since = Math.floor(Date.now() / 1000);
    const stop = subscribeSocial(liveTailFilters(feedSource, filter, since), (event) => {
      if (!live) return;
      // The coalescer delivers every event from every consumer sharing this
      // relay set, so an unguarded handler fills the Following feed with
      // whoever happened to reply to anything. See `noteMatchesSource`.
      if (!noteMatchesSource(event, feedSource, allowedAuthors, filter)) return;
      // A stale event from someone else's backfill is not "new".
      if (event.created_at < since) return;
      setPending((current) => (
        current.some((note) => note.id === event.id) ? current : [event, ...current]
      ));
    }, { relays: relayList });
    return () => {
      live = false;
      stop();
    };
  }, [awaitingFollows, feedSource, filter, allowedAuthors, relayList]);

  useFeedSignals(notes, sort);

  const loadMore = useCallback(() => {
    if (pageRequest.current || exhausted) return;
    const until = nextCursor(notes);
    if (until === undefined) return;
    setLoadingMore(true);
    const requestedFor = Symbol(key);
    pageRequest.current = requestedFor;

    /**
     * Page, and if the configured relays have nothing left, widen once.
     *
     * "No more content" is usually a statement about four relays, not about
     * Nostr: a small or unlucky relay set runs dry after a couple of pages
     * while the same query has plenty more elsewhere. The widened read is a
     * one-shot fallback, not a change to where the client lives: it does not
     * touch the user's relay list.
     */
    const page = async (): Promise<{ events: NostrEvent[]; widened: boolean }> => {
      const first = await fetchPage(feedSource, relayList, until, filter);
      if (first.length > 0 || widenedRef.current) return { events: first, widened: false };
      const wider = widenedRelays(relayList);
      if (wider.length === relayList.length) return { events: first, widened: false };
      const second = await fetchPage(feedSource, wider, until, filter);
      return { events: second, widened: true };
    };

    void page()
      .then(({ events, widened }) => {
        // The reader switched feeds while this page was in flight. Merging it
        // now would splice these notes into a different feed's list, and the
        // next write would persist them into that feed's cache.
        if (pageRequest.current !== requestedFor) return;
        if (widened) widenedRef.current = true;
        setNotes((current) => {
          const guarded = filterForSource(events, feedSource, allowedAuthors, filter);
          const merged = groupReposts(mergeNotes(current, guarded)).notes;
          // A page that adds nothing new means we've reached the end of what
          // these relays will serve: `until` overlap guarantees at least the
          // boundary note comes back, so "no growth" is the honest signal.
          // Only final once the wider set has been tried too.
          if (merged.length === current.length && widenedRef.current) setExhausted(true);
          persist(merged);
          return merged;
        });
      })
      .catch(() => {
        if (pageRequest.current === requestedFor) setExhausted(true);
      })
      .finally(() => {
        if (pageRequest.current !== requestedFor) return;
        pageRequest.current = null;
        setLoadingMore(false);
      });
  }, [notes, exhausted, key, feedSource, relayList, filter, allowedAuthors, persist]);

  const showPending = useCallback(() => {
    setPending((buffered) => {
      if (buffered.length === 0) return buffered;
      setNotes((current) => {
        const merged = groupReposts(mergeNotes(current, buffered)).notes;
        persist(merged);
        return merged;
      });
      return [];
    });
  }, [persist]);

  const refresh = useCallback(() => {
    setExhausted(false);
    setNonce((n) => n + 1);
  }, []);

  const { ordered, repostersByTarget } = useRankedFeed(notes, sort, key, showHighlights);

  return {
    notes: ordered,
    repostersByTarget,
    loading: loading && !awaitingFollows,
    loadingMore,
    error: failedRequest === request,
    exhausted,
    pendingCount: pending.length,
    refresh,
    loadMore,
    showPending,
  };
}
