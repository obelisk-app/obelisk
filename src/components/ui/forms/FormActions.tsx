import type { ReactNode } from 'react';
import Button from '../buttons/Button';
import { cn } from '@/utils/style/cn';

/**
 * The submit row of a form that is not in a dialog or a sheet (a dialog's
 * form submits through `ModalFooter`'s `form`, a sheet's through
 * `SheetActions`' `form`), by role:
 *
 *   block   a standalone page card: one full-width pill
 *   start   an inline editor panel: save, then cancel, from the left
 *   end     a form inside a dialog tab: cancel, then submit, at the right
 *   sheet   a form inside a phone sheet's tab: the shell's full-width `.btn-primary`
 */
export type FormActionsVariant = 'block' | 'start' | 'end' | 'sheet';

export interface FormActionsProps {
  submitLabel: ReactNode;
  /** Shown instead of `submitLabel` while `busy`. */
  busyLabel?: ReactNode;
  busy?: boolean;
  /** Disables the submit (a blank required field); `busy` disables it too. */
  disabled?: boolean;
  /** The dismiss button (`start` and `end`); disabled while busy. */
  cancel?: { label: ReactNode; onClick: () => void };
  variant?: FormActionsVariant;
  /** The id of the form this submits, when the row sits outside it. */
  form?: string;
  submitTestId?: string;
  className?: string;
}

const ROW: Record<FormActionsVariant, string | undefined> = {
  block: undefined,
  start: 'flex gap-2 pt-1',
  end: 'flex justify-end gap-2',
  sheet: 'mt-1 flex flex-col',
};

/** One look per role, so a form's submit means the same thing wherever the form sits. */
export default function FormActions({
  submitLabel, busyLabel, busy = false, disabled = false, cancel, variant = 'block', form, submitTestId, className,
}: FormActionsProps) {
  const label = busy && busyLabel !== undefined ? busyLabel : submitLabel;
  const off = disabled || busy;
  return (
    <div className={cn(ROW[variant], className)}>
      {variant === 'sheet' && (
        <Button variant="mobilePrimary" type="submit" form={form} disabled={off}  data-testid={submitTestId}>{label}</Button>
      )}
      {variant === 'block' && (
        <Button type="submit" form={form} variant="pill" size="sm" className="w-full" disabled={off} data-testid={submitTestId}>{label}</Button>
      )}
      {variant === 'end' && cancel && (
        <Button variant="outline" size="sm" onClick={cancel.onClick} disabled={busy}>{cancel.label}</Button>
      )}
      {(variant === 'start' || variant === 'end') && (
        <Button
          type="submit"
          form={form}
          variant={variant === 'start' ? 'pill' : 'primary'}
          size={variant === 'start' ? 'sm' : 'md'}
          disabled={off}
          data-testid={submitTestId}
        >
          {label}
        </Button>
      )}
      {variant === 'start' && cancel && (
        <Button variant="secondary" size="sm" onClick={cancel.onClick} disabled={busy}>{cancel.label}</Button>
      )}
    </div>
  );
}
