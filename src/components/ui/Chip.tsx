import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

/** `selected` is the one green every chip uses when it is on. */
export type ChipState = 'idle' | 'selected';
/**
 * - `toggle`: an independent on/off chip (`aria-pressed`), e.g. a tag filter.
 * - `radio`: one of a group (`role="radio"`, `aria-checked`); wrap the group in `role="radiogroup"`.
 */
export type ChipBehavior = 'toggle' | 'radio';
/** `10` / `11` / `xs` are the three type sizes in use; `touch` is `xs` with the taller settings tap target. */
export type ChipSize = '10' | '11' | 'xs' | 'touch';

const SIZE_CLASS: Record<ChipSize, string> = {
  '10': 'px-2 py-0.5 text-[10px]',
  '11': 'px-2.5 py-1 text-[11px]',
  xs: 'px-3 py-1 text-xs',
  touch: 'px-3 py-1.5 text-xs',
};

/**
 * Idle follows the "clickable must read clickable" rule (white text, border,
 * faint fill); selected is the majority recipe of the 22 hand-rolled chips,
 * which had four different selected greens.
 */
const STATE_CLASS: Record<ChipState, string> = {
  idle: 'border-lc-border bg-lc-card/60 text-lc-white hover:border-lc-green/50',
  selected: 'border-lc-green/40 bg-lc-green/15 text-lc-green',
};

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'role'> {
  state?: ChipState;
  behavior?: ChipBehavior;
  size?: ChipSize;
}

/** A selectable rounded chip: a real `<button>` with its pressed or checked state exposed. */
const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { state = 'idle', behavior = 'toggle', size = 'xs', className, children, ...rest },
  ref,
) {
  const on = state === 'selected';
  const a11y = behavior === 'radio'
    ? { role: 'radio' as const, 'aria-checked': on }
    : { 'aria-pressed': on };
  return (
    <button
      ref={ref}
      type="button"
      {...a11y}
      className={cn(
        'rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60 disabled:cursor-not-allowed disabled:opacity-40',
        SIZE_CLASS[size],
        STATE_CLASS[state],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Chip;
