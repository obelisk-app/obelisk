import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * - `accent`: the visible slider in the accent color (settings).
 * - `overlay`: invisible and stretched over a custom track, so the track
 *   stays the picture and the native control stays the keyboard and screen
 *   reader surface (voice note progress).
 */
export type RangeVariant = 'accent' | 'overlay';

const VARIANT_CLASS: Record<RangeVariant, string> = {
  accent: 'w-full accent-lc-green',
  overlay: 'absolute inset-0 h-full w-full cursor-pointer opacity-0',
};

export interface RangeProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  variant?: RangeVariant;
  /** A range has no placeholder to fall back on, so it is always named. */
  'aria-label': string;
}

const Range = forwardRef<HTMLInputElement, RangeProps>(function Range({ variant = 'accent', className, ...rest }, ref) {
  return <input ref={ref} type="range" className={cn(VARIANT_CLASS[variant], className)} {...rest} />;
});

export default Range;
