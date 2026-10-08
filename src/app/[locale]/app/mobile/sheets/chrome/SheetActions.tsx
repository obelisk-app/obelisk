'use client';

import Button from '@/components/ui/buttons/Button';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export interface SheetPrimaryAction {
  label: string;
  /** What the button does; leave out when it submits a form (`form`). */
  onClick?: () => void;
  /** Submit the form with this id (`useForm`'s `id`) instead of calling `onClick`, so Enter in a field and the button do one thing. */
  form?: string;
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
        <Button
          variant={primary.tone === 'danger' ? 'mobileDanger' : 'mobilePrimary'}
          type={primary.form ? 'submit' : 'button'}
          form={primary.form}
          onClick={primary.onClick}
          disabled={primary.disabled || primary.busy}
          data-testid={primary.testId}
        >
          {primary.icon}
          {primary.busy && primary.busyLabel ? primary.busyLabel : primary.label}
        </Button>
      )}
      <Button variant="mobileSecondary" type="button" className={cancelClassName} onClick={onCancel}>
        {dismiss === 'close' ? t('common.close') : t('common.cancel')}
      </Button>
    </>
  );
}
