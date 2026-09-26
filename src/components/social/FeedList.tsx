'use client';

/**
 * The scrolling list of notes.
 *
 * Paging used to be a "Load more" button at the bottom, which made the feed
 * feel inert — scrolling did nothing.
 *
 *  - An IntersectionObserver sentinel pages the next batch as it comes into
 *    view, with a manual button left as the fallback for when the observer
 *    is unavailable (jsdom, very old browsers) or a page failed.
 *  - The live-tail buffer enters the list ONLY through the pill. It briefly
 *    auto-merged while the reader was at the top, and arriving at the top
 *    also triggered a refresh; both moved the list under whoever was reading
 *    it, because `showPending` and `refresh` each re-sort through
 *    `mergeNotes`. Going back up to re-read something is precisely when the
 *    rows must not move.
 *  - Pull-to-refresh stays: it is a deliberate gesture, not a side effect of
 *    scrolling.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslation } from '@/i18n/context';
import type { FeedState } from '@/lib/social/useFeed';
import NoteCard from './NoteCard';

/** How close to the top counts as "still at the top" for auto-merge. */
const AT_TOP_PX = 120;
/**
 * Pulling up when already at the top is the gesture people use to refresh,
 * so honour it instead of making them find a button. Throttled, because the
 * gesture fires continuously and each refresh is a relay round trip.
 */
const PULL_REFRESH_COOLDOWN_MS = 4000;
/** Enough pull to be deliberate rather than the tail of a scroll. */
const PULL_THRESHOLD_PX = 60;
/** Start fetching this far before the sentinel is actually visible. */
const PREFETCH_MARGIN = '600px';

export default function FeedList({
  state,
  onOpenProfile,
  onOpenNote,
  onReply,
  onQuote,
  onZap,
  onOpenArticle,
  onOpenTag,
  onAtTopChange,
  emptyLabel,
  header,
  /** Scroll container to observe. Defaults to the nearest scrollable ancestor. */
  scrollRef,
}: {
  state: FeedState;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  onReply?: (note: NostrEvent) => void;
  onQuote?: (note: NostrEvent) => void;
  onZap?: (note: NostrEvent) => void;
  /**
   * Long-form cards are real focusable buttons, so omitting this made every
   * article click a silent no-op — the reason articles "didn't work".
   */
  onOpenArticle?: (note: NostrEvent) => void;
  /** Hashtags open the feed's own search instead of leaving for /t. */
  onOpenTag?: (tag: string) => void;
  /**
   * Scroll position, for hosts that render floating controls outside the
   * scroller — the back-to-top button can't live in here, because inside
   * the scroll container it would scroll away with the content.
   */
  onAtTopChange?: (atTop: boolean) => void;
  emptyLabel?: string;
  header?: React.ReactNode;
  scrollRef?: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const { notes, loading, loadingMore, error, exhausted, pendingCount, repostersByTarget } = state;
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { loadMore, showPending, refresh } = state;

  // Page as the sentinel approaches. `loadMore` already no-ops while a page
  // is in flight or the feed is exhausted, so a burst of intersections
  // during a fast scroll can't stack requests.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || exhausted || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: PREFETCH_MARGIN });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, exhausted, notes.length]);

  // Reported upward so the host can hide its back-to-top control; nothing
  // in here branches on it any more.
  const findScroller = useCallback((): HTMLElement | Window | null => {
    if (scrollRef?.current) return scrollRef.current;
    let node: HTMLElement | null = sentinelRef.current?.parentElement ?? null;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return node;
      node = node.parentElement;
    }
    return typeof window === 'undefined' ? null : window;
  }, [scrollRef]);

  /** Throttles the deliberate pull gesture below — each pull is a round trip. */
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    const scroller = findScroller();
    if (!scroller) return;
    const read = () => {
      const top = scroller instanceof Window ? scroller.scrollY : scroller.scrollTop;
      // Deliberately does NOT refresh.
      //
      // Scrolling back to the top used to fire a full `refresh()`, which
      // replaces the list and re-sorts it. Scrolling up is how you re-read
      // something, so the reliable way to lose the note you were going back
      // for was to go back for it. New notes arrive through the pending
      // pill, which says how many there are and moves nothing until asked.
      onAtTopChange?.(top <= AT_TOP_PX);
    };
    read();
    scroller.addEventListener('scroll', read, { passive: true });
    return () => scroller.removeEventListener('scroll', read);
  }, [findScroller, onAtTopChange]);

  // Pull-to-refresh, for mouse wheels and touch alike. Replaces the refresh
  // button: at the top of a feed, pulling further up means "show me what's
  // new", and that's the gesture people already reach for.
  useEffect(() => {
    const scroller = findScroller();
    if (!scroller || scroller instanceof Window) return;

    let pulled = 0;

    // `<= 2`, not `=== 0`: iOS rubber-banding and sub-pixel scroll offsets
    // mean a feed the reader sees as "at the top" rarely reports exactly 0,
    // and the strict check made the gesture do nothing on a phone.
    const atVeryTop = () => scroller.scrollTop <= 2;
    const maybeRefresh = () => {
      const now = Date.now();
      if (pulled < PULL_THRESHOLD_PX) return;
      if (now - lastRefreshRef.current < PULL_REFRESH_COOLDOWN_MS) return;
      lastRefreshRef.current = now;
      pulled = 0;
      refresh();
    };

    const onWheel = (event: WheelEvent) => {
      if (!atVeryTop() || event.deltaY >= 0) {
        pulled = 0;
        return;
      }
      pulled += -event.deltaY;
      maybeRefresh();
    };

    let touchStart: number | null = null;
    const onTouchStart = (event: TouchEvent) => {
      touchStart = atVeryTop() ? (event.touches[0]?.clientY ?? null) : null;
      pulled = 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      // Only the *start* has to be at the top. Re-checking here meant that
      // the moment the browser rubber-banded (scrollTop going negative or
      // the content shifting under the finger) the pull was abandoned
      // halfway, which is why the gesture never fired on a phone.
      if (touchStart === null) return;
      pulled = (event.touches[0]?.clientY ?? touchStart) - touchStart;
      maybeRefresh();
    };

    scroller.addEventListener('wheel', onWheel, { passive: true });
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
    };
  }, [findScroller, refresh]);

  // No auto-merge, even at the top.
  //
  // `showPending` runs the buffer through `mergeNotes`, which re-sorts the
  // whole list — so a note arriving while you were reading row three
  // reshuffled everything under you. The pill is one tap and it is the
  // reader's call.

  if (loading && notes.length === 0) {
    return (
      <div className="space-y-3 p-4" data-testid="feed-loading">
        {[0, 1, 2].map((item) => <div key={item} className="lc-skeleton h-28 rounded-2xl" />)}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center" data-testid="feed-empty">
        <p className="max-w-xs text-sm text-lc-muted">
          {error ? t('social.loadFailed') : emptyLabel ?? t('profileFeed.empty')}
        </p>
        <button type="button" className="lc-pill-secondary px-4 py-2 text-xs" onClick={state.refresh}>
          {t('social.refresh')}
        </button>
      </div>
    );
  }

  return (
    <div data-testid="feed-list">
      {header}

      {/*
        Shown at the top too, now that arriving at the top no longer merges
        the buffer by itself. Gating it on `!atTop` used to be fine because
        the notes let themselves in up there; without that the pill was the
        only route in, and it was the one place it stayed hidden.
      */}
      {pendingCount > 0 && (
        <div className="pointer-events-none sticky top-2 z-[3] flex justify-center">
          <button
            type="button"
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-lc-green px-4 py-1.5 text-xs font-semibold text-lc-black shadow-lg shadow-black/40 transition hover:brightness-110"
            onClick={showPending}
            data-testid="feed-pending"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
            </svg>
            {pendingCount} {t('social.newNotes')}
          </button>
        </div>
      )}

      <div className="divide-y divide-lc-border/70">
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onOpenProfile={onOpenProfile}
            onOpenNote={onOpenNote}
            onReply={onReply}
            onQuote={onQuote}
            onZap={onZap}
            onOpenArticle={onOpenArticle}
            onOpenTag={onOpenTag}
            reposters={repostersByTarget.get(note.id)}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="flex justify-center p-6" data-testid="feed-sentinel">
        {exhausted ? (
          <span className="text-xs text-lc-muted">{t('social.endOfFeed')}</span>
        ) : loadingMore ? (
          <span className="flex items-center gap-2 text-xs text-lc-muted" data-testid="feed-loading-more">
            <span className="lc-spinner h-4 w-4" aria-hidden="true" />
            {t('social.loadingMore')}
          </span>
        ) : (
          // Fallback only — the observer normally fires before this is seen.
          <button
            type="button"
            className="lc-pill-secondary px-5 py-2 text-xs"
            onClick={loadMore}
            data-testid="feed-load-more"
          >
            {t('social.loadMore')}
          </button>
        )}
      </div>
    </div>
  );
}
