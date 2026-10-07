import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/style/cn';
import { buttonClass, type ButtonSize, type ButtonTone, type ButtonVariant } from '@/utils/style/button-class';
import Spinner from '../feedback/Spinner';

/** The looks, sizes and tones are documented with their class tables in `src/utils/style/button-class.ts`. */
export { buttonClass, type ButtonSize, type ButtonTone, type ButtonVariant } from '@/utils/style/button-class';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  /** Shows a spinner, sets `aria-busy` and disables the button. */
  loading?: boolean;
  children?: ReactNode;
}

/**
 * A real `<button>` that defaults to `type="button"`: 160 hand-rolled ones
 * had no `type`, which makes them submit buttons inside any `<form>`.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', tone = 'default', loading = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass({ variant, size, tone }), className)}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
});

export default Button;
