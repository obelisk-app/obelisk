import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/style/cn';

export interface SkeletonProps extends HTMLAttributes<HTMLElement> {
  /**
   * `shimmer` (the default) is the `.lc-skeleton` gradient sweep from
   * globals.css; `circle` is its round form (`.lc-skeleton-circle`, an avatar);
   * `pulse` fades in and out, the settings rows' placeholder, colored by the
   * caller (`bg-lc-border`).
   */
  variant?: 'shimmer' | 'circle' | 'pulse';
  /** `span` inside a line of text, `div` (the default) elsewhere. */
  as?: 'div' | 'span';
  /** Size and shape: `h-24 rounded-xl`, `h-3 w-2/3`. */
  className?: string;
}

const VARIANT_CLASS = { shimmer: 'lc-skeleton', circle: 'lc-skeleton-circle', pulse: 'animate-pulse' } as const;

/** The placeholder a data-fetching component shows until its data arrives. */
export default function Skeleton({ variant = 'shimmer', as: Tag = 'div', className, ...rest }: SkeletonProps) {
  return <Tag className={cn(VARIANT_CLASS[variant], className)} {...rest} />;
}
