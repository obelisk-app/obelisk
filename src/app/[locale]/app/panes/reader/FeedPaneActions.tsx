'use client';

import { type FeedPaneMode } from '@/utils/shell/desktop/feed-pane';
import { useTranslations } from 'next-intl';
import { PaneIconButton } from './PaneIconButton';

/**
 * Expand / restore / close for the feed pane: the feed pane's own controls.
 *
 * These exist because the rail button used to carry all of it: one control
 * cycling off → split → full → off, with nothing on screen indicating the
 * current state or the next one. Size belongs to the thing being sized.
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
  const t = useTranslations();
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
