import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { fieldNoteId } from './Field';

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children' | 'aria-label'>;

/** Either a visible label (which wraps the box) or an `aria-label` for a box in a table cell. */
export type CheckboxProps = NativeProps & {
  /** Classes for the wrapping label, or for the box itself when there is no label. */
  className?: string;
  /** Classes for the box when a label wraps it. */
  inputClassName?: string;
} & (
  | {
      label: ReactNode;
      'aria-label'?: string;
      /** Muted note under the label, read as the box's description. */
      hint?: ReactNode;
      /** Red note under the label, announced; marks the box invalid. */
      error?: string;
      /** Classes for the block that holds the label and its note, when there is one. */
      fieldClassName?: string;
    }
  | { label?: undefined; 'aria-label': string; hint?: undefined; error?: undefined; fieldClassName?: undefined }
);

/** Native checkbox in the accent color, always named. */
const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, inputClassName, hint, error, fieldClassName, id: idProp, ...rest },
  ref,
) {
  const generated = useId();
  if (label === undefined) {
    return <input ref={ref} id={idProp} type="checkbox" className={cn('accent-lc-green', inputClassName, className)} {...rest} />;
  }
  const hasNote = Boolean(error) || hint !== undefined;
  const id = idProp ?? (hasNote ? generated : undefined);
  const box = (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 text-sm text-lc-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
        className,
      )}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        aria-invalid={error ? true : undefined}
        aria-describedby={id ? fieldNoteId(id, hasNote) : undefined}
        className={cn('accent-lc-green', inputClassName)}
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
  if (!hasNote || !id) return box;
  return (
    <div className={fieldClassName}>
      {box}
      {error ? (
        <p id={`${id}-note`} role="alert" className="mt-1 text-xs text-red-400">{error}</p>
      ) : (
        <p id={`${id}-note`} className="mt-1 text-xs text-lc-muted">{hint}</p>
      )}
    </div>
  );
});

export default Checkbox;
