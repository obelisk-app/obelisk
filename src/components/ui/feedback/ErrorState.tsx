import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

/**
 * `inline` is the one-line red note under a control; `box` is the bordered
 * banner; `sheet` is the phone shell's note, in its own red
 * (`--presence-dnd`, `mobile-shell.css`).
 */
export type ErrorStateVariant = 'inline' | 'box' | 'sheet';

const VARIANT_CLASS: Record<ErrorStateVariant, string> = {
  inline: 'text-xs text-red-400',
  box: 'rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300',
  sheet: 'text-[12px] text-[color:var(--presence-dnd)]',
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
