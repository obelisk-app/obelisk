import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

/**
 * Pick the size by role, not by eye:
 *   hint under a control   xs        in-row meta (counts, mono keys)   11 or 10
 *   paragraph              sm        social feed body                  13
 *   panel section label    10 + variant="label"
 *
 * The body variants carry a size and a tone for the three most common roles,
 * and an explicit `size` or `tone` still wins:
 *   caption   text-xs  muted   the hint or status line under a control or a row
 *   muted     text-sm  muted   secondary body copy, an empty state's sentence
 *   lead      text-lg  muted   the intro under a page's or a section's title
 *
 * Headings are `Heading` (`./Heading`), form labels `Label` (`../forms/Label`).
 */
export type TextSize = '9' | '10' | '11' | '13' | 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
export type TextTone = 'default' | 'muted' | 'accent' | 'danger' | 'inherit';
export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold';
/**
 * `body` adds nothing; `label` is the small-caps section label: uppercase, one
 * tracking (`wider`) at every size; `caption`, `muted` and `lead` set a size
 * and a tone (above).
 */
export type TextVariant = 'body' | 'label' | 'caption' | 'muted' | 'lead';

const VARIANT_DEFAULTS: Record<TextVariant, { size?: TextSize; tone?: TextTone }> = {
  body: {},
  label: {},
  caption: { size: 'xs', tone: 'muted' },
  muted: { size: 'sm', tone: 'muted' },
  lead: { size: 'lg', tone: 'muted' },
};

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
  as?: 'span' | 'p' | 'div' | 'li' | 'dt' | 'dd' | 'time';
  dateTime?: string;
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  variant?: TextVariant;
  truncate?: 'truncate' | 'wrap';
  children?: ReactNode;
}

/**
 * One text element for paragraphs, the muted hint and the section label,
 * which between them account for most of the 545 `text-lc-muted` strings
 * this replaced.
 *
 * Defaults are deliberately neutral (`span`, inherited size and color), so
 * `<Text tone="muted" size="xs">` renders exactly `text-xs text-lc-muted`.
 */
export default function Text({
  as: Tag = 'span',
  size,
  tone,
  weight = 'normal',
  variant = 'body',
  truncate,
  className,
  children,
  ...rest
}: TextProps) {
  const shownSize = size ?? VARIANT_DEFAULTS[variant].size;
  return (
    <Tag
      className={cn(
        shownSize && SIZE_CLASS[shownSize],
        WEIGHT_CLASS[weight],
        variant === 'label' && 'uppercase tracking-wider',
        TONE_CLASS[tone ?? VARIANT_DEFAULTS[variant].tone ?? 'inherit'],
        truncate === 'truncate' && 'truncate',
        className,
      ) || undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
