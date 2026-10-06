import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';
import Field, { fieldNoteId } from './Field';
import Spinner from './Spinner';

/** `2xs` is the inline category picker in a dense row; `md` matches the Input `md` box. */
export type SelectSize = '2xs' | 'xs' | 'sm' | 'md';
/** `dark` sits on a `bg-lc-black` surface, where a black select would vanish. */
export type SelectTone = 'black' | 'dark';
/** `mobile` is the mobile shell's `.appearance-select`; `bare` leaves styling to `className`/`style`. */
export type SelectVariant = 'surface' | 'mobile' | 'bare';
/** `loading`: the options are still arriving. The select is disabled, busy, and shows a spinner beside it. */
export type SelectStatus = 'idle' | 'loading';

/** Native `<select>` with the input surface; the hand-rolled ones were all `rounded ... bg-lc-black`. */
const SIZE_CLASS: Record<SelectSize, string> = {
  '2xs': 'rounded px-1.5 py-0.5 text-xs',
  xs: 'rounded px-2 py-1.5 text-xs',
  sm: 'rounded px-2 py-1.5 text-sm',
  md: 'rounded-lg px-3 py-2 text-sm',
};

const TONE_CLASS: Record<SelectTone, string> = {
  black: 'bg-lc-black',
  dark: 'bg-lc-dark',
};

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: SelectSize;
  tone?: SelectTone;
  variant?: SelectVariant;
  invalid?: boolean;
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  fieldClassName?: string;
  status?: SelectStatus;
}

export function selectSurfaceClass(size: SelectSize, tone: SelectTone, variant: SelectVariant, invalid: boolean): string {
  switch (variant) {
    case 'bare':
      return '';
    case 'mobile':
      return 'appearance-select';
    default:
      return cn(
        SIZE_CLASS[size],
        'border',
        invalid ? 'border-red-500' : 'border-lc-border',
        TONE_CLASS[tone],
        'text-lc-white outline-none',
        !invalid && 'focus:border-lc-green',
        'disabled:cursor-not-allowed disabled:opacity-60',
      );
  }
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    size = 'sm',
    tone = 'black',
    variant = 'surface',
    invalid,
    label,
    error,
    hint,
    fieldClassName,
    status = 'idle',
    className,
    id: idProp,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const generated = useId();
  const id = idProp ?? generated;
  const wrapped = label !== undefined || error !== undefined || hint !== undefined;
  const isInvalid = Boolean(invalid) || Boolean(error);
  const loading = status === 'loading';
  const select = (
    <select
      ref={ref}
      id={id}
      disabled={disabled || loading}
      aria-invalid={isInvalid ? true : undefined}
      aria-busy={loading ? true : undefined}
      aria-describedby={wrapped ? fieldNoteId(id, Boolean(error) || hint !== undefined) : undefined}
      className={cn(selectSurfaceClass(size, tone, variant, isInvalid), className)}
      {...rest}
    >
      {children}
    </select>
  );
  const control = loading ? (
    <span className="inline-flex items-center gap-2">
      {select}
      <Spinner size="sm" />
    </span>
  ) : select;
  if (!wrapped) return control;
  return (
    <Field htmlFor={id} label={label} error={error} hint={hint} className={fieldClassName}>
      {control}
    </Field>
  );
});

export default Select;
