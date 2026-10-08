import type { FormEvent, FormHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/style/cn';
import FormError, { type FormErrorVariant } from './FormError';

/**
 * How the fields stack, by the form's role:
 *
 *   bare      no layout of its own (composers, search rows: the caller's classes)
 *   stack     a short desktop form or inline editor (`space-y-3`)
 *   sections  a dialog body of titled sections (`space-y-7 p-5`)
 *   sheet     a phone sheet's fields (a 10px column)
 *   row       one line that wraps: field, toggle, submit
 *   card      a standalone form on its own page, on the dark card (the voice join page)
 */
export type FormLayout = 'bare' | 'stack' | 'sections' | 'sheet' | 'row' | 'card';

const LAYOUT_CLASS: Record<FormLayout, string | undefined> = {
  bare: undefined,
  stack: 'space-y-3',
  sections: 'space-y-7 p-5',
  sheet: 'flex flex-col gap-2.5',
  row: 'flex flex-wrap items-center gap-2',
  card: 'w-full max-w-md space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6',
};

/** What `Form` reads from `useForm`: the element id, the submit and the busy flag. */
export interface FormBinding {
  id: string;
  submit: (event?: FormEvent<HTMLFormElement>) => unknown;
  submitting?: boolean;
}

export interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'noValidate'> {
  /** The `useForm` state: wires the id (for a submit button outside the form), the submit and `aria-busy`. */
  form?: FormBinding;
  /** A form not on `useForm` (a composer, a search row) passes its own handler, which calls `preventDefault`. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => unknown;
  layout?: FormLayout;
  /** Drawn as the form's last child (`FormError`); nothing while empty. */
  error?: ReactNode;
  errorVariant?: FormErrorVariant;
  /**
   * Let the browser's own checks (`required`, `type="email"`) block a submit.
   * Off: a form's spec does the checking and says why in the reader's language.
   */
  browserValidation?: boolean;
  children?: ReactNode;
}

/**
 * The one `<form>` element. Every form in the app renders this, not a raw
 * `<form>` (tests/components/forms.test.ts): the layout by role, the submit
 * wiring, `noValidate`, and an error slot.
 */
export default function Form({
  form,
  onSubmit,
  layout = 'bare',
  error,
  errorVariant,
  browserValidation = false,
  id,
  className,
  children,
  ...rest
}: FormProps) {
  return (
    <form
      {...rest}
      id={form?.id ?? id}
      onSubmit={form?.submit ?? onSubmit}
      noValidate={!browserValidation}
      aria-busy={form?.submitting || undefined}
      className={cn(LAYOUT_CLASS[layout], className)}
    >
      {children}
      <FormError variant={errorVariant}>{error}</FormError>
    </form>
  );
}
