'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeftIcon } from '@/components/ui/icons/icons';
import { PaneIconButton } from './PaneIconButton';

/*
 * The pane's other parts live in their own files. They are re-exported here
 * because the desktop frame (`desktop/DesktopMain.tsx`, `FeedSplitPane.tsx`,
 * `ReaderPaneSlot.tsx`) imports them from this path; point those imports at
 * the new files and drop these lines once that frame's own refactor lands.
 */
export { FeedPaneActions } from './FeedPaneActions';
export { ReaderPaneContent } from './ReaderPaneContent';

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
  const t = useTranslations();
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
