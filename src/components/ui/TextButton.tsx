import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * An action that reads as a link inside text: "retry", "show more", a
 * person's name in a reply line, "reset". Still a `<button>` (it does
 * something; it does not go somewhere), with the shared focus ring.
 *
 *   accent  green, underlined on hover (the inline call to action)
 *   muted   grey, always underlined, white on hover (a quiet secondary)
 *   plain   keeps the surrounding colour, underlined on hover (a name)
 *
 * Type size and weight come from the caller's `className`; colour comes
 * only from `tone`, because `cn` does not resolve conflicting colour classes.
 */
export type TextButtonTone = 'accent' | 'muted' | 'plain';

const TONE_CLASS: Record<TextButtonTone, string> = {
  accent: 'text-lc-green hover:underline',
  muted: 'text-lc-muted underline underline-offset-4 hover:text-lc-white',
  plain: 'hover:underline',
};

export interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: TextButtonTone;
}

const TextButton = forwardRef<HTMLButtonElement, TextButtonProps>(function TextButton(
  { tone = 'accent', type = 'button', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'rounded-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60 disabled:cursor-not-allowed disabled:opacity-60',
        TONE_CLASS[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export default TextButton;
