import { cn } from '@/utils/style/cn';

export type PulseDotSize = 'xs' | 'sm';

const SIZE_CLASS: Record<PulseDotSize, string> = { xs: 'h-1.5 w-1.5', sm: 'h-2 w-2' };

export interface PulseDotProps {
  /** The dot's background class (`bg-red-400`, `bg-yellow-400`). */
  color: string;
  /** `xs` 6px, `sm` 8px. */
  size?: PulseDotSize;
  className?: string;
}

/**
 * A dot that pulses while something is live: recording a voice note, an
 * active call, a relay the banner is waiting on. Decorative; the text beside
 * it says what is happening.
 */
export default function PulseDot({ color, size = 'sm', className }: PulseDotProps) {
  return <span className={cn('animate-pulse rounded-full', SIZE_CLASS[size], color, className)} aria-hidden="true" />;
}
