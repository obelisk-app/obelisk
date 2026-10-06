'use client';

import { useTranslation } from '@/i18n/context';
import { cn } from '@/components/ui/cn';

export interface SheetPrimaryAction {
  label: string;
  onClick: () => void;
  /** While true the button is disabled and shows `busyLabel`. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  testId?: string;
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

/**
 * The footer that ends a mobile sheet: the full-width `.btn-primary` and the
 * quiet `.btn-cancel` under it. Renders a fragment, so both stay direct
 * children of the sheet exactly as when every sheet wrote them by hand.
 */
export default function SheetActions({ primary, onCancel, dismiss = 'cancel', cancelClassName }: SheetActionsProps) {
  const { t } = useTranslation();
  return (
    <>
      {primary && (
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled || primary.busy}
          className="btn-primary"
          data-testid={primary.testId}
        >
          {primary.busy && primary.busyLabel ? primary.busyLabel : primary.label}
        </button>
      )}
      <button type="button" className={cn('btn-cancel', cancelClassName)} onClick={onCancel}>
        {dismiss === 'close' ? t('common.close') : t('common.cancel')}
      </button>
    </>
  );
}
