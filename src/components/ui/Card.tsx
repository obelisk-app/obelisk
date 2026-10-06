import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type CardSurface = 'dark' | 'black' | 'card' | 'translucent';
/** `row` (`px-2 py-1.5`) is the bordered list-row card: one person, one tag, one member. */
export type CardPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'row';
export type CardRadius = 'md' | 'lg' | 'xl' | '2xl';

const SURFACE_CLASS: Record<CardSurface, string> = {
  dark: 'bg-lc-dark',
  black: 'bg-lc-black',
  card: 'bg-lc-card',
  translucent: 'bg-lc-black/40',
};

const PADDING_CLASS: Record<CardPadding, string> = {
  none: '',
  xs: 'p-1.5',
  sm: 'p-2',
  md: 'p-3',
  lg: 'p-4',
  row: 'px-2 py-1.5',
};

const RADIUS_CLASS: Record<CardRadius, string> = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  surface?: CardSurface;
  padding?: CardPadding;
  radius?: CardRadius;
  as?: 'div' | 'section' | 'article' | 'li' | 'aside';
  children?: ReactNode;
}

/**
 * The bordered container: `rounded-* border border-lc-border bg-lc-*`.
 * Defaults match the most common hand-rolled card,
 * `rounded-xl border border-lc-border bg-lc-dark p-3`.
 */
export default function Card({
  surface = 'dark',
  padding = 'md',
  radius = 'xl',
  as: Tag = 'div',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cn(RADIUS_CLASS[radius], 'border border-lc-border', SURFACE_CLASS[surface], PADDING_CLASS[padding], className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
