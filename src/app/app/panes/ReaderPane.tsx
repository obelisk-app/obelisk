'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import ArticleReader from '@/components/social/ArticleCard';
import NoteThread from '@/components/social/NoteThread';
import { type FeedPaneMode } from '@/utils/shell/feed-pane';
import { useTranslation } from '@/i18n/context';
import { ChevronLeftIcon } from '@/components/ui/icons';

/**
 * The feed pane's own controls.
 *
 * These exist because the rail button used to carry all of it: one control
 * cycling off → split → full → off, with nothing on screen indicating the
 * current state or the next one. Size belongs to the thing being sized.
 */
/**
 * Header for the thread / article reader.
 *
 * `h-14` and `px-4` are not arbitrary: they match the chat header and the
 * feed pane header, so every column's title sits on the same baseline rather
 * than each pane floating at its own height.
 *
 * Back rather than close, because this reader is reached *from* somewhere and
 * the gesture people reach for is back - including the OS swipe, which
 * `useHistoryDismiss` wires up.
 */
export function ReaderPaneHeader({
  title,
  full,
  onToggleFull,
  onBack,
}: {
  title: string;
  full: boolean;
  onToggleFull: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="lc-header-surface flex h-14 shrink-0 items-center gap-2 border-b border-lc-border px-4">
      <button
        type="button"
        className="lc-icon-btn -ml-1"
        onClick={onBack}
        aria-label={t('common.back')}
        title={t('common.back')}
        data-testid="desktop-thread-back"
      >
        <ChevronLeftIcon size={20} strokeWidth={2.3} />
      </button>
      <h2 className="text-sm font-semibold text-lc-white">{title}</h2>
      <div className="ml-auto flex items-center gap-0.5">
        <PaneIconButton
          label={full ? t('social.restoreFeed') : t('social.expandFeed')}
          testId="desktop-thread-expand"
          onClick={onToggleFull}
        >
          {full ? (
            <>
              <path d="M4 14h6v6" /><path d="M20 10h-6V4" />
              <path d="M14 10l7-7" /><path d="M3 21l7-7" />
            </>
          ) : (
            <>
              <path d="M15 3h6v6" /><path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" /><path d="M3 21l7-7" />
            </>
          )}
        </PaneIconButton>
        <PaneIconButton label={t('common.close')} testId="desktop-thread-close" onClick={onBack}>
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </PaneIconButton>
      </div>
    </div>
  );
}

/**
 * Expand / restore / close for the feed pane.
 *
 * These used to sit in a header of their own, which meant the feed carried
 * two stacked bars: one saying "Feed" with an ✕, and the feed's own toolbar
 * saying Following/Global, the filters and search. The second one already
 * answers "what am I looking at", so the first was a 56px strip of empty
 * space - very obviously empty once the pane went full width.
 */
export function FeedPaneActions({
  mode,
  canRestore: restorable,
  onExpand,
  onRestore,
  onClose,
}: {
  mode: FeedPaneMode;
  canRestore: boolean;
  onExpand: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mx-1 h-5 w-px shrink-0 bg-lc-border" aria-hidden="true" />
      <div className="flex items-center gap-0.5" data-testid="feed-pane-actions">
        {mode === 'split' ? (
          <PaneIconButton
            label={t('social.expandFeed')}
            testId="feed-pane-expand"
            onClick={onExpand}
          >
            <path d="M15 3h6v6" /><path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </PaneIconButton>
        ) : restorable ? (
          <PaneIconButton
            label={t('social.restoreFeed')}
            testId="feed-pane-restore"
            onClick={onRestore}
          >
            <path d="M4 14h6v6" /><path d="M20 10h-6V4" />
            <path d="M14 10l7-7" /><path d="M3 21l7-7" />
          </PaneIconButton>
        ) : null}
        <PaneIconButton label={t('common.close')} testId="feed-pane-close" onClick={onClose}>
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </PaneIconButton>
      </div>
    </>
  );
}

function PaneIconButton({
  label,
  testId,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="lc-icon-btn"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

/**
 * What the reader pane shows: the article, or the thread at the top of the
 * stack. One body for both the fullscreen and the side-by-side variant.
 */
export function ReaderPaneContent({
  article,
  threadNoteId,
  onOpenProfile,
  onOpenNote,
}: {
  article: NostrEvent | null;
  threadNoteId: string | null;
  onOpenProfile: (pubkey: string) => void;
  /** Follow a note from inside the thread, keeping the way back. */
  onOpenNote: (id: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid={article ? 'desktop-article-pane' : 'desktop-thread-body'}>
      {article ? (
        <ArticleReader note={article} onOpenProfile={onOpenProfile} />
      ) : threadNoteId ? (
        <NoteThread noteId={threadNoteId} onOpenProfile={onOpenProfile} onOpenNote={onOpenNote} />
      ) : null}
    </div>
  );
}
