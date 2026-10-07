import type { ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

export { fieldNoteId } from '@/utils/style/field-note';

export interface FieldProps {
  /** The `id` of the control this label describes. */
  htmlFor: string;
  label?: ReactNode;
  /** Shown under the control in red and announced as an alert. */
  error?: string;
  /** Shown under the control in muted text when there is no error. */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Label, control, hint/error. The label is a real `<label for>` so clicking
 * it focuses the control and screen readers read it as the control's name;
 * 67 hand-rolled inputs had neither an `id` nor an `aria-label`.
 */
export default function Field({ htmlFor, label, error, hint, className, children }: FieldProps) {
  const noteId = `${htmlFor}-note`;
  return (
    <div className={cn('block', className)}>
      {label !== undefined && (
        <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-medium text-lc-muted">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={noteId} role="alert" className="mt-1 text-xs text-red-400">{error}</p>
      ) : hint !== undefined ? (
        <p id={noteId} className="mt-1 text-xs text-lc-muted">{hint}</p>
      ) : null}
    </div>
  );
}
