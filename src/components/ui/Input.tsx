import { forwardRef, useId, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import Field, { fieldNoteId } from './Field';
import InputEnd, { endSlotCount, type InputClear, type InputSecret, type InputStatus } from './InputEnd';
import {
  inputSurfaceClass,
  type InputAdornment,
  type InputFontSize,
  type InputSize,
  type InputTone,
  type InputVariant,
} from './input-surface';
import { mergeRefs } from './merge-refs';

export {
  inputSurfaceClass,
  type InputAdornment,
  type InputEndWidth,
  type InputFontSize,
  type InputSize,
  type InputSurfaceOptions,
  type InputTone,
  type InputVariant,
} from './input-surface';
export type { InputClear, InputSecret, InputSecretKind, InputStatus } from './InputEnd';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: InputSize;
  variant?: InputVariant;
  tone?: InputTone;
  fontSize?: InputFontSize;
  /** Red border and `aria-invalid` without a message; `error` sets both and shows the text. */
  invalid?: boolean;
  /** Renders a `<label for>` above the control. */
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  /** Classes for the Field wrapper, when `label`, `error` or `hint` is set. */
  fieldClassName?: string;
  /** Decorative icon at the start; the control pads itself around it. */
  prefix?: ReactNode;
  /** An element at the end, typically a button; the control pads itself around it. */
  suffix?: ReactNode;
  /** Classes for the `relative` wrapper that exists only when the control is adorned. */
  wrapperClassName?: string;
  /** `loading` adds an end spinner and `aria-busy`; the field stays editable. */
  status?: InputStatus;
  /** A clear button, shown while the controlled `value` is non-empty and the field is editable. */
  clear?: InputClear;
  /** Masks the value behind a show/hide button; replaces `type`. */
  secret?: InputSecret;
}

const NSEC_ATTRS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
} as const;

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = 'md',
    variant = 'surface',
    tone,
    fontSize,
    invalid,
    label,
    error,
    hint,
    fieldClassName,
    prefix,
    suffix,
    wrapperClassName,
    status = 'idle',
    clear,
    secret,
    className,
    id: idProp,
    type,
    ...rest
  },
  ref,
) {
  const generated = useId();
  const own = useRef<HTMLInputElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  const setRef = useMemo(() => mergeRefs(ref, own), [ref]);
  const id = idProp ?? generated;
  const wrapped = label !== undefined || error !== undefined || hint !== undefined;
  const isInvalid = Boolean(invalid) || Boolean(error);
  const editable = !rest.disabled && !rest.readOnly;
  const showClear = clear !== undefined && editable && String(rest.value ?? '') !== '';
  const endCount = endSlotCount({
    loading: status === 'loading',
    clear: showClear,
    secret: secret !== undefined,
    suffix: suffix !== undefined,
  });
  const adorned: InputAdornment | null = prefix !== undefined
    ? (endCount > 0 ? 'both' : 'prefix')
    : (endCount > 0 ? 'suffix' : null);
  const surface = inputSurfaceClass({
    size,
    variant,
    tone,
    fontSize,
    invalid: isInvalid,
    adorned,
    endWidth: endCount > 1 ? 'double' : 'single',
  });
  const nsec = secret?.kind === 'nsec';
  let control = (
    <input
      ref={setRef}
      id={id}
      type={secret ? (revealed ? 'text' : 'password') : type}
      aria-invalid={isInvalid ? true : undefined}
      aria-busy={status === 'loading' ? true : undefined}
      aria-describedby={wrapped ? fieldNoteId(id, Boolean(error) || hint !== undefined) : undefined}
      className={cn(surface, nsec && 'font-mono', className)}
      {...(nsec ? NSEC_ATTRS : undefined)}
      {...rest}
    />
  );
  if (adorned) {
    control = (
      <div className={cn('relative', wrapperClassName)}>
        {prefix !== undefined && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lc-muted">{prefix}</span>
        )}
        {control}
        {endCount > 0 && (
          <InputEnd
            controlId={id}
            status={status}
            clear={showClear ? clear : undefined}
            secret={secret}
            revealed={revealed}
            onToggleReveal={() => setRevealed((v) => !v)}
            onClear={() => {
              clear?.onClear();
              own.current?.focus();
            }}
            suffix={suffix}
          />
        )}
      </div>
    );
  }
  if (!wrapped) return control;
  return (
    <Field htmlFor={id} label={label} error={error} hint={hint} className={fieldClassName}>
      {control}
    </Field>
  );
});

export default Input;
