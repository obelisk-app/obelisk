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
import { filterForSource, noteMatchesSource, mergeNotes, nextCursor } from './feed';
import { widenedRelays } from './relays';
import { readFeedCache, writeFeedCache } from './cache';
import type { ContentFilter } from './kinds';
import type { FeedSort } from './rank';
import { subscribeSocial } from './pool';
import { groupReposts } from './repost';
import { cacheIdFor, fetchPage, liveTailFilters, sourceKey, type FeedSource } from './feed-source';
import { useFeedSignals, useRankedFeed } from './useFeedRanking';

export type { FeedSource } from './feed-source';

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
  const cacheId = cacheIdFor(source);
  // The filter is part of the key: a narrowed REQ returns a different page.
  // `sort` is NOT part of the key: it reorders the window we already have,
  // so changing it must not discard the page or refetch.
  const key = `${sourceKey(source)}|${relays.join(',')}|${filter}`;
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
  // Which feed is on screen right now. An in-flight page resolves into
  // whatever the hook is showing *then*, not what it was showing when the
  // request went out: switching tabs mid-page-load merged Following notes
  // into Global, and the next write persisted them there.
  const keyRef = useRef(key);
  keyRef.current = key;
  // Whether this feed has already fallen back to the wider relay set. Reset
  // with the feed key below: widening is per view, not per session.
  const widenedRef = useRef(false);
  // Built once per follow-list change rather than per delivered event: the
  // live tail can fire hundreds of times a minute on a busy relay set.
  const allowedAuthors = useMemo(
    () => (source.kind === 'following' ? new Set(source.authors) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source.kind === 'following' ? source.authors : null],
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
    if (source.kind === 'following' && source.authors.length === 0) return;
    writeFeedCache(
      relayList,
      cacheId,
      merged.filter((note) => noteMatchesSource(note, source, allowedAuthors, filter)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayList, cacheId, key, allowedAuthors]);

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
    const authorsUnknown = source.kind === 'following' && source.authors.length === 0;
    const cached = readFeedCache(relayList, cacheId)
      .filter((note) => authorsUnknown || noteMatchesSource(note, source, allowedAuthors, filter));
    setNotes(cached);
    setPending([]);
    setExhausted(false);
    widenedRef.current = false;
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
    fetchPage(source, relayList, undefined, filter)
      .then((page) => {
        if (cancelled) return;
        setNotes((current) => {
          // Guard the page, not just the live tail: `fetchPage` reads through
          // the shared coalescer, which fans every consumer's events into
          // this handle. See `filterForSource`.
          const guarded = filterForSource(page, source, allowedAuthors, filter);
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
          if (current.length === 0) setError(true);
          return current;
        });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  // Live tail: new notes only (since "now"), buffered so the list doesn't
  // jump under a reading user.
  useEffect(() => {
    const following = source.kind === 'following' ? source.authors : null;
    if (following && following.length === 0) return;
    liveRef.current = true;
    const since = Math.floor(Date.now() / 1000);
    const stop = subscribeSocial(liveTailFilters(source, filter, since), (event) => {
      if (!liveRef.current) return;
      // The coalescer delivers every event from every consumer sharing this
      // relay set, so an unguarded handler fills the Following feed with
      // whoever happened to reply to anything. See `noteMatchesSource`.
      if (!noteMatchesSource(event, source, allowedAuthors, filter)) return;
      // A stale event from someone else's backfill is not "new".
      if (event.created_at < since) return;
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

  useFeedSignals(notes, sort);

  const loadMore = useCallback(() => {
    if (loadingMore || exhausted) return;
    const until = nextCursor(notes);
    if (until === undefined) return;
    setLoadingMore(true);
    const requestedFor = key;

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
      const first = await fetchPage(source, relayList, until, filter);
      if (first.length > 0 || widenedRef.current) return { events: first, widened: false };
      const wider = widenedRelays(relayList);
      if (wider.length === relayList.length) return { events: first, widened: false };
      const second = await fetchPage(source, wider, until, filter);
      return { events: second, widened: true };
    };

    void page()
      .then(({ events, widened }) => {
        // The reader switched feeds while this page was in flight. Merging it
        // now would splice these notes into a different feed's list, and the
        // next write would persist them into that feed's cache.
        if (keyRef.current !== requestedFor) return;
        if (widened) widenedRef.current = true;
        setNotes((current) => {
          const guarded = filterForSource(events, source, allowedAuthors, filter);
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
      .catch(() => setExhausted(true))
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, loadingMore, exhausted, key, cacheId, filter]);

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
