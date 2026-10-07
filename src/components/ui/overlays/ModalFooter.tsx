'use client';

import type { ReactNode, Ref } from 'react';
import { useTranslations } from 'next-intl';
import Button, { type ButtonSize, type ButtonTone, type ButtonVariant } from '../buttons/Button';
import { ZapIcon } from '../icons/icons';
import { cn } from '@/utils/style/cn';

/**
 * `bar`: status text on the left, the actions on the right, a hairline
 * above; every desktop modal. `alert`: the confirmation dialogs' buttons,
 * stacked full width on a phone and in a right-aligned row from `sm` up,
 * with no hairline.
 */
export type ModalFooterVariant = 'bar' | 'alert';
/**
 * `primary` is the main action, `danger` a destructive one, `secondary` a
 * side action, `zap` a Lightning payment (the yellow pill with the zap icon).
 */
export type ModalFooterTone = 'primary' | 'danger' | 'secondary' | 'zap';

export interface ModalFooterAction {
  label: ReactNode;
  onClick?: () => void;
  tone?: ModalFooterTone;
  disabled?: boolean;
  /** Submit the form with this id (`type="submit"`) instead of calling `onClick`. */
  form?: string;
  title?: string;
  testId?: string;
}

export interface ModalFooterCancel {
  onClick: () => void;
  /** Defaults to "Cancel". */
  label?: ReactNode;
  testId?: string;
}

export interface ModalFooterProps {
  /** Left slot: status or meta text ("2 selected · 3 shown"). Bar only. */
  meta?: ReactNode;
  /** The dismiss button, first in the row. */
  cancel?: ModalFooterCancel;
  /** Focus target for the dismiss button (a confirmation focuses Cancel, not the destructive action). */
  cancelRef?: Ref<HTMLButtonElement>;
  /** The actions after it, the main one last. */
  actions?: ReadonlyArray<ModalFooterAction>;
  /** Anything else for the right slot (a toggle chip), after the actions. */
  children?: ReactNode;
  variant?: ModalFooterVariant;
  className?: string;
}

type Look = { variant: ButtonVariant; size: ButtonSize; tone?: ButtonTone };

/** One look per role and variant, so a footer button means the same thing in every modal. */
const LOOK: Record<ModalFooterVariant, Record<ModalFooterTone | 'cancel', Look>> = {
  bar: {
    cancel: { variant: 'outline', size: 'sm' },
    secondary: { variant: 'outline', size: 'sm' },
    danger: { variant: 'outline', size: 'sm', tone: 'danger' },
    primary: { variant: 'primary', size: 'sm' },
    zap: { variant: 'zap', size: 'sm' },
  },
  alert: {
    cancel: { variant: 'outlinePill', size: 'lg' },
    secondary: { variant: 'outlinePill', size: 'lg' },
    danger: { variant: 'danger', size: 'lg' },
    primary: { variant: 'pill', size: 'sm' },
    zap: { variant: 'zap', size: 'sm' },
  },
};

const FRAME: Record<ModalFooterVariant, string> = {
  bar: 'flex shrink-0 items-center justify-between gap-3 border-t border-lc-border px-5 py-3',
  alert: 'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
};

/**
 * The one modal footer. Every `<Modal>` with actions at its foot renders this
 * instead of its own `<footer>` (tests/components/modal-chrome.test.ts).
 */
export default function ModalFooter({ meta, cancel, cancelRef, actions = [], children, variant = 'bar', className }: ModalFooterProps) {
  const t = useTranslations();
  const look = LOOK[variant];
  const buttons = (
    <>
      {cancel && (
        <Button {...look.cancel} ref={cancelRef} onClick={cancel.onClick} data-testid={cancel.testId}>
          {cancel.label ?? t('common.cancel')}
        </Button>
      )}
      {actions.map((action, index) => (
        <Button
          key={index}
          {...look[action.tone ?? 'primary']}
          type={action.form ? 'submit' : 'button'}
          form={action.form}
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.title}
          data-testid={action.testId}
        >
          {action.tone === 'zap' && <ZapIcon filled className="h-3.5 w-3.5" />}
          {action.label}
        </Button>
      ))}
      {children}
    </>
  );
  if (variant === 'alert') return <footer className={cn(FRAME.alert, className)}>{buttons}</footer>;
  return (
    <footer className={cn(FRAME.bar, className)}>
      <div className="min-w-0 text-xs text-lc-muted">{meta}</div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{buttons}</div>
    </footer>
  );
}
