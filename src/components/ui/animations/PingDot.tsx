import { cn } from '@/utils/style/cn';

export type PingDotSize = 'xs' | 'sm';

const SIZE_CLASS: Record<PingDotSize, string> = { xs: 'h-1.5 w-1.5', sm: 'h-2 w-2' };

export interface PingDotProps {
  /** The dot's background class (`bg-lc-green`, `bg-amber-300`); the halo takes the same color. */
  color: string;
  /** `xs` 6px (the status pills), `sm` 8px (the room header). */
  size?: PingDotSize;
  /** The halo's opacity; the dot itself is solid. */
  halo?: 50 | 70;
  /** False shows the still dot alone, for a settled state. */
  ping?: boolean;
  className?: string;
}

/**
 * A status dot with a ping halo: the voice room's live dot and the SFU and
 * media-sync pills. Decorative; the pill's text says the state.
 */
export default function PingDot({ color, size = 'xs', halo = 70, ping = true, className }: PingDotProps) {
  return (
    <span className={cn('relative inline-flex', SIZE_CLASS[size], className)} aria-hidden="true">
      {ping && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full', halo === 50 ? 'opacity-50' : 'opacity-70', color)} />}
      <span className={cn('relative inline-flex rounded-full', SIZE_CLASS[size], color)} />
    </span>
  );
}
