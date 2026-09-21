'use client';

/**
 * The scrolling list of notes.
 *
 * Paging used to be a "Load more" button at the bottom and the live tail sat
 * behind a pill you had to click even when you were already looking at the
 * top of the list. Both made the feed feel inert: scrolling did nothing, and
 * new notes arrived but didn't appear.
 *
 * Now:
 *  - An IntersectionObserver sentinel pages the next batch as it comes into
 *    view, with a manual button left as the fallback for when the observer
 *    is unavailable (jsdom, very old browsers) or a page failed.
 *  - The live-tail buffer merges itself when the user is at the top. The pill
 *    only appears once they've scrolled away, where splicing notes in would
 *    shift what they're reading.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslation } from '@/i18n/context';
import type { FeedState } from '@/lib/social/useFeed';
import NoteCard from './NoteCard';

/** How close to the top counts as "still at the top" for auto-merge. */
const AT_TOP_PX = 120;
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
  emptyLabel?: string;
  header?: React.ReactNode;
  scrollRef?: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const { notes, loading, loadingMore, error, exhausted, pendingCount, repostersByTarget } = state;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);

  const { loadMore, showPending } = state;

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

  // Track whether the reader is at the top, to decide auto-merge vs. pill.
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

  useEffect(() => {
    const scroller = findScroller();
    if (!scroller) return;
    const read = () => {
      const top = scroller instanceof Window ? scroller.scrollY : scroller.scrollTop;
      setAtTop(top <= AT_TOP_PX);
    };
    read();
    scroller.addEventListener('scroll', read, { passive: true });
    return () => scroller.removeEventListener('scroll', read);
  }, [findScroller]);

  // At the top, new notes just appear — that's what "live" should mean.
  useEffect(() => {
    if (atTop && pendingCount > 0) showPending();
  }, [atTop, pendingCount, showPending]);

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

      {pendingCount > 0 && !atTop && (
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
