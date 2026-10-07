import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

/** `inline` is the one-line red note under a control; `box` is the bordered banner. */
export type ErrorStateVariant = 'inline' | 'box';

const VARIANT_CLASS: Record<ErrorStateVariant, string> = {
  inline: 'text-xs text-red-400',
  box: 'rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300',
};

export interface ErrorStateProps extends HTMLAttributes<HTMLElement> {
  variant?: ErrorStateVariant;
  as?: 'p' | 'div' | 'span';
  children?: ReactNode;
}

/**
 * Red error copy. Announced as an alert, which the hand-rolled copies
 * (43 of them, in 36 variations) never were.
 */
export default function ErrorState({ variant = 'inline', as: Tag = 'p', className, children, ...rest }: ErrorStateProps) {
  return (
    <Tag role="alert" className={cn(VARIANT_CLASS[variant], 'break-words', className)} {...rest}>
      {children}
    </Tag>
  );
}
