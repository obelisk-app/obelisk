'use client';

import { type FeedPaneMode } from '@/utils/shell/desktop/feed-pane';
import { useTranslations } from 'next-intl';
import { PaneIconButton } from './PaneIconButton';
import { CloseIcon, MaximizeIcon, MinimizeIcon } from '@/assets/icons';

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
            icon={MaximizeIcon}
          />
        ) : restorable ? (
          <PaneIconButton
            label={t('social.restoreFeed')}
            testId="feed-pane-restore"
            onClick={onRestore}
            icon={MinimizeIcon}
          />
        ) : null}
        <PaneIconButton label={t('common.close')} testId="feed-pane-close" onClick={onClose} icon={CloseIcon} />
      </div>
    </>
  );
}
