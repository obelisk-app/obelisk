'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Button from '../buttons/Button';
import CloseButton from '../buttons/CloseButton';
import { ChevronLeftIcon } from '@/assets/icons';
import { cn } from '@/utils/style/cn';

/**
 * `bar`: title (+ subtitle) on the left, the close button on the right, a
 * hairline below; every desktop modal. `alert`: a centred title under a
 * tinted icon, no close button (the footer's cancel closes it); the
 * confirmation dialogs.
 */
export type ModalHeaderVariant = 'bar' | 'alert';
/** The tint of an alert's icon circle. */
export type ModalHeaderTone = 'danger' | 'accent' | 'warning';

export interface ModalHeaderProps {
  title: ReactNode;
  /** One line under the title, muted. In an alert, the message. */
  subtitle?: ReactNode;
  /** A glyph before the title (bar) or in a tinted circle above it (alert). */
  icon?: ReactNode;
  /**
   * Default true: the icon is decoration and hidden from screen readers. Pass
   * false for an icon that names itself (a game preview with `role="img"` and
   * a label), so its label is still announced.
   */
  decorativeIcon?: boolean;
  /** Bar only: a back chevron before the title, for a modal with sub-views. */
  onBack?: () => void;
  /** Bar: the close button. An alert has none. */
  onClose?: () => void;
  /** Accessible name of the close button; defaults to "Close". */
  closeLabel?: string;
  variant?: ModalHeaderVariant;
  tone?: ModalHeaderTone;
  /** Ids for the modal's `aria-labelledby` / `aria-describedby`. */
  titleId?: string;
  subtitleId?: string;
  titleTestId?: string;
  /** Extra controls between the title and the close button (tabs, a copy button). */
  children?: ReactNode;
  className?: string;
}

const TONE_CLASS: Record<ModalHeaderTone, string> = {
  danger: 'bg-red-500/10 text-red-400',
  accent: 'bg-lc-green/10 text-lc-green',
  warning: 'bg-yellow-500/10 text-yellow-300',
};

/**
 * The one modal header. Every `<Modal>` renders this instead of its own
 * `<h2>` row (tests/components/modal-chrome.test.ts), so titles, spacing and
 * the close button look the same in every dialog. The close button is
 * `CloseButton` (the icon, not the glyph), with the focus ring and `type`.
 */
export default function ModalHeader({
  title, subtitle, icon, decorativeIcon = true, onBack, onClose, closeLabel, variant = 'bar', tone = 'danger',
  titleId, subtitleId, titleTestId, children, className,
}: ModalHeaderProps) {
  const t = useTranslations();
  if (variant === 'alert') {
    return (
      <header className={cn('text-center', className)}>
        {icon && (
          <div className={cn('mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full', TONE_CLASS[tone])} aria-hidden={decorativeIcon || undefined}>
            {icon}
          </div>
        )}
        <h2 id={titleId} className="break-words text-lg font-semibold text-lc-white" data-testid={titleTestId}>{title}</h2>
        {subtitle !== undefined && (
          <p id={subtitleId} className="mt-2 whitespace-pre-line break-words text-sm text-lc-muted">{subtitle}</p>
        )}
      </header>
    );
  }
  return (
    <header className={cn('flex shrink-0 items-center gap-3 border-b border-lc-border px-5 py-3', className)}>
      {onBack && (
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} aria-label={t('common.back')}>
          <ChevronLeftIcon size={16} />
        </Button>
      )}
      {icon && <span className="flex shrink-0 text-lc-green" aria-hidden={decorativeIcon || undefined}>{icon}</span>}
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="break-words text-base font-bold text-lc-white" data-testid={titleTestId}>{title}</h2>
        {subtitle !== undefined && <p id={subtitleId} className="break-words text-xs text-lc-muted">{subtitle}</p>}
      </div>
      {children}
      {onClose && <CloseButton onClick={onClose} label={closeLabel} />}
    </header>
  );
}
