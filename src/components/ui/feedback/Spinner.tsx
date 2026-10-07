import { cn } from '@/utils/style/cn';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

/** `md` is the stylesheet's own 20px `.lc-spinner`; the others override it. */
const SIZE_CLASS: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: '',
  lg: 'h-8 w-8',
};

export interface SpinnerProps {
  size?: SpinnerSize;
  /**
   * Accessible name. With one, the spinner is a live `status` region; without
   * one it is decorative (the caller's text already says what is loading).
   */
  label?: string;
  className?: string;
}

/** The `.lc-spinner` ring from globals.css, sized by variant. */
export default function Spinner({ size = 'md', label, className }: SpinnerProps) {
  const cls = cn('lc-spinner inline-block shrink-0', SIZE_CLASS[size], className);
  if (label) return <span className={cls} role="status" aria-label={label} />;
  return <span className={cls} aria-hidden="true" />;
}
