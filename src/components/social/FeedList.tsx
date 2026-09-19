'use client';

/**
 * The scrolling list of notes, with the controls the old feed never had:
 * a "load more" that pages backwards with `until`, a refresh, and a
 * "N new notes" pill so the live tail can't shove the list around under a
 * reader mid-sentence.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslation } from '@/i18n/context';
import type { FeedState } from '@/lib/social/useFeed';
import NoteCard from './NoteCard';

export default function FeedList({
  state,
  onOpenProfile,
  onOpenNote,
  onReply,
  onQuote,
  onZap,
  emptyLabel,
  header,
}: {
  state: FeedState;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  onReply?: (note: NostrEvent) => void;
  onQuote?: (note: NostrEvent) => void;
  onZap?: (note: NostrEvent) => void;
  emptyLabel?: string;
  header?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { notes, loading, loadingMore, error, exhausted, pendingCount } = state;

  // Skeletons only when there is genuinely nothing to show. With cached notes
  // on screen the refresh happens silently behind them.
  if (loading && notes.length === 0) {
    return (
      <div className="space-y-3 p-4" data-testid="feed-loading">
        {[0, 1, 2].map((item) => <div key={item} className="lc-skeleton h-24 rounded-xl" />)}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 text-center" data-testid="feed-empty">
        <p className="text-sm text-lc-muted">
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
      {pendingCount > 0 && (
        <div className="sticky top-0 z-[3] flex justify-center py-2">
          <button
            type="button"
            className="lc-pill-primary px-4 py-1.5 text-xs shadow-lg"
            onClick={state.showPending}
            data-testid="feed-pending"
          >
            ↑ {pendingCount} {t('social.newNotes')}
          </button>
        </div>
      )}

      <div className="divide-y divide-lc-border">
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onOpenProfile={onOpenProfile}
            onOpenNote={onOpenNote}
            onReply={onReply}
            onQuote={onQuote}
            onZap={onZap}
          />
        ))}
      </div>

      <div className="flex justify-center p-4">
        {exhausted ? (
          <span className="text-xs text-lc-muted">{t('social.endOfFeed')}</span>
        ) : (
          <button
            type="button"
            className="lc-pill-secondary px-5 py-2 text-xs disabled:opacity-50"
            onClick={state.loadMore}
            disabled={loadingMore}
            data-testid="feed-load-more"
          >
            {loadingMore ? t('common.saving') : t('social.loadMore')}
          </button>
        )}
      </div>
    </div>
  );
}
