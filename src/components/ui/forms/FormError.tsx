import type { ReactNode } from 'react';
import ErrorState, { type ErrorStateVariant } from '../feedback/ErrorState';

/**
 * Where the form sits: `inline` (a desktop form's red line), `box` (the
 * bordered banner at the foot of a long dialog form), `sheet` (a phone
 * sheet's note in the shell's own red).
 */
export type FormErrorVariant = ErrorStateVariant;

export interface FormErrorProps {
  variant?: FormErrorVariant;
  className?: string;
  testId?: string;
  /** The message; nothing is drawn while it is empty, so a form passes `form.error` as it is. */
  children?: ReactNode;
}

/** A form's error line, announced as an alert. `Form` draws one from its `error` prop; place one by hand to put it elsewhere. */
export default function FormError({ variant = 'inline', className, testId, children }: FormErrorProps) {
  if (children === null || children === undefined || children === false || children === '') return null;
  return (
    <ErrorState variant={variant} className={className} data-testid={testId}>
      {children}
    </ErrorState>
  );
}
