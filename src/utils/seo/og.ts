/**
 * Every page's own preview card: a 1200x630 PNG drawn by the page's
 * `opengraph-image.tsx` route, in the page's language, so no two pages (and
 * no two languages of a page) share an image.
 *
 * The URL is named explicitly, at the page's public address plus
 * `/opengraph-image`: the file convention alone would build it from the
 * internal route (`/en/...`), which only redirects.
 */

import type { Locale } from '@/i18n';
import type { Translate } from '@/i18n/keys';
import { absoluteUrl } from './alternates';
import type { PageImage } from './page';
import { OG_SIZE } from '@/constants/seo/og';

/** The card of the page at `path` (locale-free), with its alt text. */
export function cardImage(locale: Locale, path: string, alt: string): PageImage {
  const page = absoluteUrl(locale, path);
  return { url: `${page}/opengraph-image`, ...OG_SIZE, type: 'image/png', alt };
}

/** The alt text of a card: "Obelisk preview card: <title>", in the page's language. */
export function cardAlt(t: Translate, title: string): string {
  return t('seo.card.alt', { title });
}

/** Cut user text (a note, a bio) at a word boundary for a card; site copy is written to fit instead. */
export function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}
