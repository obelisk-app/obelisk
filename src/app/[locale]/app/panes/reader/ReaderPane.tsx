'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeftIcon, CloseIcon, MaximizeIcon, MinimizeIcon } from '@/assets/icons';
import { PaneIconButton } from './PaneIconButton';
import Heading from '@/components/ui/layout/Heading';

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
        <ChevronLeftIcon size={20} strokeWidth={2.5} />
      </button>
      <Heading as="h2" variant="panel">{title}</Heading>
      <div className="ml-auto flex items-center gap-0.5">
        <PaneIconButton
          label={full ? t('social.restoreFeed') : t('social.expandFeed')}
          testId="desktop-thread-expand"
          onClick={onToggleFull}
          icon={full ? MinimizeIcon : MaximizeIcon}
        />
        <PaneIconButton label={t('common.close')} testId="desktop-thread-close" onClick={onBack} icon={CloseIcon} />
      </div>
    </div>
  );
}
