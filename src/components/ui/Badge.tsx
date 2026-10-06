import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'muted' | 'accent' | 'outline' | 'danger';
export type BadgeSize = '10' | '11' | 'xs';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-lc-black text-lc-muted',
  muted: 'bg-lc-dark text-lc-muted',
  accent: 'bg-lc-olive-dark text-lc-green',
  outline: 'border border-lc-border text-lc-muted',
  danger: 'bg-red-500/10 text-red-300',
};

const SIZE_CLASS: Record<BadgeSize, string> = {
  '10': 'px-1.5 py-px text-[10px]',
  '11': 'px-2 py-0.5 text-[11px]',
  xs: 'px-2.5 py-1 text-xs',
};

export interface BadgeProps extends HTMLAttributes<HTMLElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  font?: 'sans' | 'mono';
  as?: 'span' | 'div' | 'li';
  children?: ReactNode;
}

/** The small rounded pill: `rounded-full px-2 py-0.5 text-[11px]`. */
export default function Badge({
  tone = 'neutral',
  size = '11',
  font = 'sans',
  as: Tag = 'span',
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <Tag
      className={cn('inline-flex items-center gap-1 rounded-full', SIZE_CLASS[size], TONE_CLASS[tone], font === 'mono' && 'font-mono', className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
