'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/style/cn';

export interface SheetPrimaryAction {
  label: string;
  onClick: () => void;
  /** While true the button is disabled and shows `busyLabel`. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  testId?: string;
  /** `danger` is the solid red full-width button of a destructive confirmation (disconnect). */
  tone?: 'primary' | 'danger';
  /** A glyph before the label. */
  icon?: ReactNode;
}

export interface SheetActionsProps {
  /** The sheet's main action (`.btn-primary`); leave out for a footer that only dismisses. */
  primary?: SheetPrimaryAction;
  onCancel: () => void;
  /** Which word the dismiss button says. */
  dismiss?: 'cancel' | 'close';
  /** Extra class on the dismiss button (the relay menu's outlined Close). */
  cancelClassName?: string;
}

const PRIMARY_CLASS = { primary: 'btn-primary', danger: 'settings-btn-danger' } as const;

/**
 * The footer that ends a mobile sheet: the full-width `.btn-primary` (or the
 * red `.settings-btn-danger` of a destructive confirmation) and the quiet
 * `.btn-cancel` under it. Every `<Sheet>` with actions at its foot uses this.
 * Renders a fragment, so both stay direct children of the sheet exactly as
 * when every sheet wrote them by hand.
 */
export default function SheetActions({ primary, onCancel, dismiss = 'cancel', cancelClassName }: SheetActionsProps) {
  const t = useTranslations();
  return (
    <>
      {primary && (
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled || primary.busy}
          className={PRIMARY_CLASS[primary.tone ?? 'primary']}
          data-testid={primary.testId}
        >
          {primary.icon}
          {primary.busy && primary.busyLabel ? primary.busyLabel : primary.label}
        </button>
      )}
      <button type="button" className={cn('btn-cancel', cancelClassName)} onClick={onCancel}>
        {dismiss === 'close' ? t('common.close') : t('common.cancel')}
      </button>
    </>
  );
}
