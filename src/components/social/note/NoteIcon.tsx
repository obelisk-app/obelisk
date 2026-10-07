'use client';

/**
 * The note action glyphs: reply, repost, like, zap, share, more and quote.
 *
 * The first version of the action row used raw unicode glyphs: `↩ ⇄ ♡ ⚡`.
 * Those codepoints are font-dependent (`⚡` and `♡` have emoji presentation
 * on most platforms), so two of the four rendered as full-colour emoji at a
 * different size and baseline from the others. So: inline SVG at a fixed
 * 24-unit viewBox, the same icon language as `NAV_ICONS` and the server rail.
 *
 * One component drawing a shape from `NOTE_ICON_SHAPES`, so the set reads
 * and edits side by side without a component per glyph.
 */

import type { ReactNode } from 'react';

export type NoteIconName = 'reply' | 'repost' | 'like' | 'zap' | 'share' | 'more' | 'quote';

const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** The strokes inside each glyph's `<svg>`. */
const NOTE_ICON_SHAPES: Readonly<Record<NoteIconName, ReactNode>> = {
  reply: (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  repost: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  like: (
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  ),
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  share: (
    <>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v14" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  quote: (
    <>
      <path d="M17 6H3" />
      <path d="M21 12H3" />
      <path d="M15 18H3" />
    </>
  ),
};

/** One note action glyph. `filled` (like, zap) makes a state change obvious. */
export default function NoteIcon({ name, filled = false }: { name: NoteIconName; filled?: boolean }) {
  return (
    <svg {...svgProps} fill={filled ? 'currentColor' : 'none'}>
      {NOTE_ICON_SHAPES[name]}
    </svg>
  );
}
