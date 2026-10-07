import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

/**
 * Pick the variant by role, and the level by the page's outline; the two are
 * independent (`<Heading as="h3" variant="panel">`):
 *
 *   display   the marketing pages' hero title (landing showcases, /features)
 *   page      a content page's title (guides, help, local data)
 *   section   a marketing section's title, with its green accent mark
 *   article   a heading inside a guide or a guide page's own section
 *   card      a card's title, and the title of a compact viewer page
 *   cardLink  a card that is a link: turns green on the card's hover
 *   panel     a heading inside a panel, a settings block or a dialog body
 *   label     the small-caps heading over a group of rows
 *
 * A variant is type only (size, weight, color, tracking); spacing and layout
 * come from the caller's `className`. With no variant the heading adds no
 * classes, for a heading a stylesheet styles (`.app-header h2`).
 */
export type HeadingVariant = 'display' | 'page' | 'section' | 'article' | 'card' | 'cardLink' | 'panel' | 'label';

const VARIANT_CLASS: Record<HeadingVariant, string> = {
  display: 'text-4xl font-extrabold leading-[1.05] tracking-tight text-lc-white md:text-6xl',
  page: 'text-4xl font-extrabold tracking-tight text-lc-white md:text-5xl',
  section: 'text-3xl font-bold text-lc-white md:text-4xl',
  article: 'text-2xl font-bold tracking-tight text-lc-white',
  card: 'text-lg font-semibold text-lc-white',
  cardLink: 'text-lg font-bold text-lc-white transition-colors group-hover:text-lc-green',
  panel: 'text-sm font-semibold text-lc-white',
  label: 'text-xs font-semibold uppercase tracking-wider text-lc-muted',
};

/** The green mark after a marketing section's title. */
export type HeadingAccent = '.' | '?';

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** The level in the page's outline, whatever the look. */
  as: 'h1' | 'h2' | 'h3' | 'h4';
  variant?: HeadingVariant;
  /**
   * The green mark after the title. `section` ends in `.` unless told
   * otherwise; `false` drops it.
   */
  accent?: HeadingAccent | false;
  children?: ReactNode;
}

/** Every heading in the app outside the dialog chrome (`ModalHeader`, `SheetHeader`). */
export default function Heading({ as: Tag, variant, accent, className, children, ...rest }: HeadingProps) {
  const mark = accent ?? (variant === 'section' ? '.' : false);
  return (
    <Tag className={cn(variant && VARIANT_CLASS[variant], className) || undefined} {...rest}>
      {children}
      {mark && <span className="text-lc-green">{mark}</span>}
    </Tag>
  );
}
