import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/utils/style/cn';
import { selectSurfaceClass, type SelectSize, type SelectTone, type SelectVariant } from '@/utils/style/select-surface';
import Field, { fieldNoteId } from './Field';
import Spinner from '../feedback/Spinner';

export { selectSurfaceClass } from '@/utils/style/select-surface';
export type { SelectSize, SelectTone, SelectVariant } from '@/utils/style/select-surface';
/** `loading`: the options are still arriving. The select is disabled, busy, and shows a spinner beside it. */
export type SelectStatus = 'idle' | 'loading';

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
