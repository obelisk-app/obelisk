import { Children, cloneElement, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

export type CardSurface = 'dark' | 'black' | 'card' | 'translucent' | 'subtle' | 'muted' | 'transparent';
export type CardTone = 'default' | 'danger';
/** `row` (`px-2 py-1.5`) is the bordered list-row card: one person, one tag, one member. */
export type CardPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'row' | 'xl' | '2xl' | '3xl' | 'hero' | 'heroResponsive';
export type CardRadius = 'md' | 'lg' | 'xl' | '2xl';

const SURFACE_CLASS: Record<CardSurface, string> = {
  transparent: '',
  subtle: 'bg-lc-dark/30',
  muted: 'bg-lc-dark/50',
  dark: 'bg-lc-dark',
  black: 'bg-lc-black',
  card: 'bg-lc-card',
  translucent: 'bg-lc-black/40',
};

const PADDING_CLASS: Record<CardPadding, string> = {
  xl: 'p-5',
  '2xl': 'p-6',
  '3xl': 'p-8',
  hero: 'p-12',
  heroResponsive: 'p-10 md:p-12',
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
  /** `interactive` preserves the stylesheet card's themed surface and hover lift. */
  variant?: 'surface' | 'interactive';
  glow?: boolean;
  /** Apply the card recipe to one existing Link, Button or other element, without nesting controls. */
  asChild?: boolean;
  surface?: CardSurface;
  tone?: CardTone;
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
  variant = 'surface',
  glow = false,
  asChild = false,
  surface = 'dark',
  tone = 'default',
  padding = 'md',
  radius = 'xl',
  as: Tag = 'div',
  className,
  children,
  ...rest
}: CardProps) {
  const classes = cn(
    variant === 'interactive' ? 'lc-card' : cn(RADIUS_CLASS[radius], 'border', tone === 'danger' ? 'border-red-500/30' : 'border-lc-border', SURFACE_CLASS[surface]),
    PADDING_CLASS[padding], glow && 'lc-glow', className,
  );
  if (asChild) {
    const child = Children.only(children) as ReactElement<HTMLAttributes<HTMLElement>>;
    return cloneElement(child, { ...rest, ...child.props, className: cn(classes, child.props.className) });
  }
  return (
    <Tag
      className={classes}
      {...rest}
    >
      {children}
    </Tag>
  );
}
