import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * One row of a suggestion list driven from the keyboard: the @mention and
 * /command pickers above the composer. `active` is the row the arrow keys
 * are on; the others tint on hover. Full width, left aligned, the caller
 * lays out what is inside.
 */
export interface OptionRowProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const OptionRow = forwardRef<HTMLButtonElement, OptionRowProps>(function OptionRow(
  { active = false, type = 'button', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lc-green/60',
        active ? 'bg-lc-border/60' : 'hover:bg-lc-border/40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export default OptionRow;
