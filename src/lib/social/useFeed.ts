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
  noteMatchesSource,
  loadFollowingFeed,
  loadGlobalFeed,
  loadProfileFeed,
  mergeNotes,
  nextCursor,
} from './feed';
import { filterFeedHighlights } from './highlights';
import {
  FOLLOWING_FEED_ID,
  GLOBAL_FEED_ID,
  profileFeedId,
  readFeedCache,
  writeFeedCache,
  type FeedCacheId,
} from './cache';
import { ensureCounts, getCounts } from './engagement';
import { ensureSocialProfiles } from './profiles';
import { applySort, type FeedSort } from './rank';
import { useMyFollows } from '@/lib/nostr-bridge';
import { wotEngine } from '@/lib/wot';
import { kindsForFilter, type ContentFilter } from './kinds';
import { subscribeSocial } from './pool';
import { groupReposts } from './repost';

export type FeedSource =
  | { kind: 'following'; authors: readonly string[] }
  | { kind: 'global' }
  | { kind: 'profile'; pubkey: string };

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

function cacheIdFor(source: FeedSource): FeedCacheId {
  if (source.kind === 'profile') return profileFeedId(source.pubkey);
  return source.kind === 'following' ? FOLLOWING_FEED_ID : GLOBAL_FEED_ID;
}

/**
 * Cheap content fingerprint of a follow list.
 *
 * Keying on `authors.length` alone meant following one person and unfollowing
 * another produced the same key — so the feed never refetched and the live
 * tail kept filtering against the old set. Recomputed only when the array
 * identity changes, so the O(n) walk is not per-render.
 */
function authorsFingerprint(authors: readonly string[]): string {
  let hash = 0;
  for (const author of authors) {
    for (let i = 0; i < author.length; i += 8) {
      hash = (Math.imul(hash, 31) + author.charCodeAt(i)) | 0;
    }
  }
  return `${authors.length}:${(hash >>> 0).toString(36)}`;
}

function sourceKey(source: FeedSource): string {
  if (source.kind === 'profile') return `profile:${source.pubkey}`;
  if (source.kind === 'global') return 'global';
  return `following:${authorsFingerprint(source.authors)}`;
}

async function fetchPage(
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

export function useFeed(
  source: FeedSource,
  relays: readonly string[],
  filter: ContentFilter = 'all',
  sort: FeedSort = 'recent',
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
  // request went out — switching tabs mid-page-load merged Following notes
  // into Global, and the next write persisted them there.
  const keyRef = useRef(key);
  keyRef.current = key;
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
   * it has been broken twice by different paths — the coalescer's
   * over-delivery, then a page resolving after a tab switch. Enforcing it at
   * the single write point costs a filter over ≤50 notes and makes the
   * invariant true by construction rather than by every caller remembering.
   */
  const persist = useCallback((merged: readonly NostrEvent[]) => {
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
    // Filter the seed too. A cache written before the guard existed holds
    // strangers, and because it is painted on mount and `mergeNotes` only
    // adds, a correct fetch can never evict them.
    const cached = readFeedCache(relayList, cacheId)
      .filter((note) => noteMatchesSource(note, source, allowedAuthors, filter));
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
    fetchPage(source, relayList, undefined, filter)
      .then((page) => {
        if (cancelled) return;
        setNotes((current) => {
          const merged = groupReposts(mergeNotes(current, page)).notes;
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

  // Live tail — new notes only (since "now"), buffered so the list doesn't
  // jump under a reading user.
  useEffect(() => {
    const following = source.kind === 'following' ? source.authors : null;
    if (following && following.length === 0) return;
    liveRef.current = true;
    const since = Math.floor(Date.now() / 1000);
    const kinds = kindsForFilter(filter);
    const filters = source.kind === 'profile'
      ? [{ kinds, authors: [source.pubkey], since }]
      : following
        ? [{ kinds, authors: [...following].slice(0, 300), since }]
        : [{ kinds, since }];
    const stop = subscribeSocial(filters, (event) => {
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

  // Engagement counts for whatever is on screen.
  useEffect(() => {
    if (notes.length === 0) return;
    void ensureCounts(notes.slice(0, 40).map((note) => note.id));
  }, [notes]);

  // Ranking needs counts for more than the visible top. Warming the whole
  // window would be wasteful, but ranking on mostly-zero counts is just
  // chronological with extra steps.
  useEffect(() => {
    if (sort !== 'top' || notes.length === 0) return;
    void ensureCounts(notes.slice(0, 100).map((note) => note.id));
  }, [notes, sort]);

  // Author names, in ONE query for the whole page. Resolving per card meant
  // ~50 round trips for data that fits in a single `authors` filter, and the
  // cards that lost the race just showed a truncated npub.
  useEffect(() => {
    if (notes.length === 0) return;
    void ensureSocialProfiles(notes.map((note) => note.pubkey));
  }, [notes]);

  const loadMore = useCallback(() => {
    if (loadingMore || exhausted) return;
    const until = nextCursor(notes);
    if (until === undefined) return;
    setLoadingMore(true);
    const requestedFor = key;
    fetchPage(source, relayList, until, filter)
      .then((page) => {
        // The reader switched feeds while this page was in flight. Merging it
        // now would splice these notes into a different feed's list — and the
        // next write would persist them into that feed's cache.
        if (keyRef.current !== requestedFor) return;
        setNotes((current) => {
          const merged = groupReposts(mergeNotes(current, page)).notes;
          // A page that adds nothing new means we've reached the end of what
          // these relays will serve — `until` overlap guarantees at least the
          // boundary note comes back, so "no growth" is the honest signal.
          if (merged.length === current.length) setExhausted(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  const refresh = useCallback(() => {
    setExhausted(false);
    setNonce((n) => n + 1);
  }, []);

  const follows = useMyFollows();
  const isMuted = useModerationStore((state) => state.isMuted);
  const isBlocked = useModerationStore((state) => state.isBlocked);
  const visible = useMemo(
    () => applyModeration(
      // A highlight of a Nostr article is not its own post — it's someone
      // else's paragraph with no commentary, and it belongs on the article,
      // where the reader can turn it on. Highlights of external pages stay:
      // nothing here can render that page, so the passage IS the content.
      filterFeedHighlights(notes),
      (pubkey) => isMuted(pubkey) || isBlocked(pubkey),
    ),
    [notes, isMuted, isBlocked],
  );

  // Derived on read rather than stored: the cache holds notes only, and the
  // grouping depends on which notes happen to share the window.
  const repostersByTarget = useMemo(() => groupReposts(visible).repostersByTarget, [visible]);

  // Re-rank when late signals land. Counts and WoT verdicts resolve after the
  // notes do, so a score computed once would be a score computed on zeros.
  const [signalTick, setSignalTick] = useState(0);
  useEffect(() => {
    if (sort !== 'top') return;
    const bump = () => setSignalTick((n) => n + 1);
    const offWot = wotEngine.on('verdicts-changed', bump);
    // Counts arrive in batches; a slow poll is cheaper than subscribing to
    // every note id and re-rendering per arrival.
    const timer = setInterval(bump, 4000);
    return () => { offWot(); clearInterval(timer); };
  }, [sort]);

  const followSet = useMemo(() => new Set(follows), [follows]);

  const ordered = useMemo(
    () => applySort(visible, sort, {
      counts: getCounts,
      isFollowed: (pubkey) => followSet.has(pubkey),
      repostersOf: (noteId) => repostersByTarget.get(noteId) ?? [],
      wotDistance: (pubkey) => wotEngine.getDistance(pubkey),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, sort, followSet, repostersByTarget, signalTick],
  );

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
