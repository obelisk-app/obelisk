import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { FeedState } from '@/hooks/social/feed/useFeed';
import { findFeedScroller, watchAtTop, watchPullToRefresh, watchSentinel } from '@/services/social/feed-scroll';

/**
 * The feed list's view model: the paging sentinel, the at-top report for the
 * host's floating controls, and pull-to-refresh. Returns the ref for the
 * sentinel row; everything else is effects.
 *
 * No auto-merge, even at the top: `showPending` runs the buffer through
 * `mergeNotes`, which re-sorts the whole list, so a note arriving while you
 * were reading row three reshuffled everything under you. The pill is one
 * tap and it is the reader's call.
 */
export function useFeedList({
  state,
  scrollRef,
  onAtTopChange,
}: {
  state: FeedState;
  scrollRef?: RefObject<HTMLElement | null>;
  onAtTopChange?: (atTop: boolean) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { loadMore, refresh, exhausted, notes } = state;

  // Page as the sentinel approaches. `loadMore` already no-ops while a page
  // is in flight or the feed is exhausted, so a burst of intersections
  // during a fast scroll can't stack requests.
  useEffect(
    () => (exhausted ? undefined : watchSentinel(sentinelRef.current, loadMore)),
    [loadMore, exhausted, notes.length],
  );

  const findScroller = useCallback(
    () => findFeedScroller(scrollRef?.current, sentinelRef.current),
    [scrollRef],
  );

  /** Throttles the deliberate pull gesture: each pull is a round trip. */
  const lastRefreshRef = useRef(0);

  // Reported upward so the host can hide its back-to-top control.
  useEffect(() => {
    const scroller = findScroller();
    return scroller ? watchAtTop(scroller, onAtTopChange) : undefined;
  }, [findScroller, onAtTopChange]);

  useEffect(() => {
    const scroller = findScroller();
    if (!scroller || scroller instanceof Window) return undefined;
    return watchPullToRefresh(scroller, refresh, lastRefreshRef);
  }, [findScroller, refresh]);

  return { sentinelRef };
}
