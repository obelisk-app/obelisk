'use client';

/**
 * The scrolling list of notes.
 *
 * Paging used to be a "Load more" button at the bottom, which made the feed
 * feel inert: scrolling did nothing.
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

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import type { FeedState } from '@/hooks/social/feed/useFeed';
import { useFeedList } from '@/hooks/social/feed/useFeedList';
import NoteCard from '../note/NoteCard';

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
   * article click a silent no-op: the reason articles "didn't work".
   */
  onOpenArticle?: (note: NostrEvent) => void;
  /** Hashtags open the feed's own search instead of leaving for /t. */
  onOpenTag?: (tag: string) => void;
  /**
   * Scroll position, for hosts that render floating controls outside the
   * scroller: the back-to-top button can't live in here, because inside
   * the scroll container it would scroll away with the content.
   */
  onAtTopChange?: (atTop: boolean) => void;
  emptyLabel?: string;
  header?: React.ReactNode;
  scrollRef?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations();
  const { notes, loading, loadingMore, exhausted, error, pendingCount, repostersByTarget, loadMore, showPending } = state;
  const { sentinelRef } = useFeedList({ state, scrollRef, onAtTopChange });

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
          {error ? t('social.loadFailed') : emptyLabel ?? t('social.profileFeed.empty')}
        </p>
        <Button variant="pillSecondary" size="xs" onClick={state.refresh}>
          {t('social.refresh')}
        </Button>
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
          <Button
            variant="pill"
            size="xs"
            className="pointer-events-auto shadow-lg shadow-black/40"
            onClick={showPending}
            data-testid="feed-pending"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
            </svg>
            {t('social.newNotesCount', { count: pendingCount })}
          </Button>
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
          // Fallback only: the observer normally fires before this is seen.
          <Button
            variant="pillSecondary"
            size="xs"
            onClick={loadMore}
            data-testid="feed-load-more"
          >
            {t('social.loadMore')}
          </Button>
        )}
      </div>
    </div>
  );
}
