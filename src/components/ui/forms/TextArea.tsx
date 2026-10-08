import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { useAutosizeTextArea, type TextAreaHeight } from '@/hooks/common/useAutosizeTextArea';
import { useForwardedRef } from '@/hooks/common/useForwardedRef';
import { fieldDescriptionIds } from '@/utils/style/field-note';
import { cn } from '@/utils/style/cn';
import Field, { fieldNoteId } from './Field';
import { inputSurfaceClass, type InputSize } from './Input';

export type { TextAreaHeight } from '@/hooks/common/useAutosizeTextArea';

/** `both` leaves the browser default, the drag handle on both axes. */
export type TextAreaResize = 'none' | 'y' | 'both';
/** `mobile` is the mobile shell's `.setup-textarea`; `bare` lets the composer card paint the surface. */
export type TextAreaVariant = 'surface' | 'mobile' | 'bare';

const RESIZE_CLASS: Record<TextAreaResize, string | undefined> = {
  none: 'resize-none',
  y: 'resize-y',
  both: undefined,
};

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: InputSize;
  variant?: TextAreaVariant;
  resize?: TextAreaResize;
  invalid?: boolean;
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  fieldClassName?: string;
  /** `auto` grows the box with its text (from `rows` up to `maxRows`); `fixed` is the default. */
  height?: TextAreaHeight;
  /** The tallest an `auto` box grows before it scrolls; unset means no cap. */
  maxRows?: number;
}

/** Same surface as Input, plus a typed resize axis. */
const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    size = 'md',
    variant = 'surface',
    resize = 'y',
    invalid,
    label,
    error,
    hint,
    fieldClassName,
    height = 'fixed',
    maxRows,
    className,
    id: idProp,
    'aria-describedby': describedBy,
    onInput,
    ...rest
  },
  ref,
) {
  const generated = useId();
  const { own, setRef } = useForwardedRef(ref);
  const handleInput = useAutosizeTextArea(own, height, rest.value, maxRows, onInput);
  const id = idProp ?? generated;
  const wrapped = label !== undefined || error !== undefined || hint !== undefined;
  const isInvalid = Boolean(invalid) || Boolean(error);
  const surface = variant === 'mobile'
    ? 'setup-textarea'
    : inputSurfaceClass({ size, variant, invalid: isInvalid });
  const control = (
    <textarea
      ref={setRef}
      id={id}
      onInput={handleInput}
      aria-invalid={isInvalid ? true : undefined}
      aria-describedby={fieldDescriptionIds(fieldNoteId(id, Boolean(error) || hint !== undefined), describedBy)}
      className={cn(surface, variant !== 'mobile' && RESIZE_CLASS[height === 'auto' ? 'none' : resize], className)}
      {...rest}
    />
  );
  if (!wrapped) return control;
  return (
    <Field htmlFor={id} label={label} error={error} hint={hint} className={fieldClassName}>
      {control}
    </Field>
  );
});

export default TextArea;
