import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Pick the size by role, not by eye:
 *   hint under a control   xs        in-row meta (counts, mono keys)   11 or 10
 *   paragraph              sm        social feed body                  13
 *   panel section label    10 + variant="label"
 *   settings-page heading  xs + variant="label"
 *   modal section heading  sm + weight="semibold" as="h3"
 */
export type TextSize = '9' | '10' | '11' | '13' | 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
export type TextTone = 'default' | 'muted' | 'accent' | 'danger' | 'inherit';
export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold';
/** `label` is the small-caps section label: uppercase, one tracking (`wider`) at every size. */
export type TextVariant = 'body' | 'label';

const SIZE_CLASS: Record<TextSize, string> = {
  '9': 'text-[9px]',
  '10': 'text-[10px]',
  '11': 'text-[11px]',
  '13': 'text-[13px]',
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
};

const TONE_CLASS: Record<TextTone, string> = {
  default: 'text-lc-white',
  muted: 'text-lc-muted',
  accent: 'text-lc-green',
  danger: 'text-red-400',
  inherit: '',
};

const WEIGHT_CLASS: Record<TextWeight, string> = {
  normal: '',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
  extrabold: 'font-extrabold',
};

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'label' | 'li' | 'dt' | 'dd';
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  variant?: TextVariant;
  truncate?: 'truncate' | 'wrap';
  children?: ReactNode;
}

/**
 * One text element for the muted hint, the heading and the section label,
 * which between them account for most of the 545 `text-lc-muted` and
 * 104 `<hN className>` strings this replaced.
 *
 * Defaults are deliberately neutral (`span`, inherited size and color), so
 * `<Text tone="muted" size="xs">` renders exactly `text-xs text-lc-muted`.
 */
export default function Text({
  as: Tag = 'span',
  size,
  tone = 'inherit',
  weight = 'normal',
  variant = 'body',
  truncate,
  className,
  children,
  ...rest
}: TextProps) {
  return (
    <Tag
      className={cn(
        size && SIZE_CLASS[size],
        WEIGHT_CLASS[weight],
        variant === 'label' && 'uppercase tracking-wider',
        TONE_CLASS[tone],
        truncate === 'truncate' && 'truncate',
        className,
      ) || undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
