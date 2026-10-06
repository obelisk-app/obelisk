import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import type { TextSize } from './Text';

export type EmptyStatePadding = 'none' | 'sm' | 'md' | 'lg';
export type EmptyStateFrame = 'plain' | 'dashed';

const PADDING_CLASS: Record<EmptyStatePadding, string> = {
  none: '',
  sm: 'py-3',
  md: 'py-6',
  lg: 'py-10',
};

const SIZE_CLASS: Partial<Record<TextSize, string>> = {
  '11': 'text-[11px]',
  xs: 'text-xs',
  sm: 'text-sm',
};

export interface EmptyStateProps extends HTMLAttributes<HTMLElement> {
  padding?: EmptyStatePadding;
  size?: '11' | 'xs' | 'sm';
  /** `dashed` is the drop-zone style box used by the lists that can be filled. */
  frame?: EmptyStateFrame;
  as?: 'div' | 'p' | 'li';
  /** An optional call to action under the message. */
  action?: ReactNode;
  children?: ReactNode;
}

/** Centered muted copy for a list with nothing in it: `py-N text-center text-sm text-lc-muted`. */
export default function EmptyState({
  padding = 'lg',
  size = 'sm',
  frame = 'plain',
  as: Tag = 'div',
  action,
  className,
  children,
  ...rest
}: EmptyStateProps) {
  return (
    <Tag
      className={cn(
        frame === 'dashed' && 'rounded-lg border border-dashed border-lc-border px-3',
        PADDING_CLASS[padding],
        'text-center',
        SIZE_CLASS[size],
        'text-lc-muted',
        className,
      )}
      {...rest}
    >
      {children}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </Tag>
  );
}
