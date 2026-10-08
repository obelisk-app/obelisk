/**
 * Every page's own preview card: a 1200x630 PNG in the page's language, so
 * no two pages (and no two languages of a page) share an image. A page names
 * its card in `generateMetadata` through `ogImage`, and that is all the image
 * code a page has.
 *
 * - A static page (the site pages, the guides, the app and the voice tool)
 *   has a file drawn ahead of time by `npm run snap-og`:
 *   `/og/cards/<locale>/<page path>.png?v=<version>`; the version changes
 *   when the card does, so the file may be cached for good.
 * - A page drawn from live data (a note, a profile, a hashtag, a relay share
 *   link) has its card drawn on request by one route,
 *   `src/app/[locale]/og/[kind]/[id]/route.ts`, named at its public address
 *   (`/og/note/<id>`, `/es/og/note/<id>`): the internal `/en/...` only
 *   redirects.
 */

import type { Locale } from '@/i18n';
import type { Translate } from '@/i18n/keys';
import { localizedPath } from './alternates';
import type { PageCard } from './cards';
import type { PageImage } from './page';
import { SITE_URL } from '@/constants/seo/alternates';
import { PAGE_CARDS } from '@/constants/seo/cards';
import {
  OG_CARD_VERSIONS, OG_HOME_NAME, OG_LIVE_KINDS, OG_LIVE_ROUTE, OG_SIZE, OG_STATIC_DIR, OG_TYPE, type OgLiveKind,
} from '@/constants/seo/og';

/** A card drawn ahead of time: a site page's, or a guide's. */
export type StaticCardRef = { page: PageCard } | { guide: string };

/** Which card a page shows: a static one, or one drawn from live data. */
export type OgCardRef = StaticCardRef | { live: OgLiveKind; id: string };

/** `kind` is one of the live-card routes. */
export function isLiveKind(kind: string): kind is OgLiveKind {
  return (OG_LIVE_KINDS as readonly string[]).includes(kind);
}

/** A static card's file, relative to `public/` and as its URL path: `/og/cards/es/help/local-data.png`. */
export function staticCardFile(locale: Locale, ref: StaticCardRef): string {
  const path = 'page' in ref ? PAGE_CARDS[ref.page].path : `/guides/${ref.guide}`;
  return `${OG_STATIC_DIR}/${locale}${path === '/' ? `/${OG_HOME_NAME}` : path}.png`;
}

/** The card's path on the site: the static file with its version, or the live route in the page's language. */
export function ogCardPath(locale: Locale, ref: OgCardRef): string {
  if ('live' in ref) return localizedPath(locale, `${OG_LIVE_ROUTE}/${ref.live}/${encodeURIComponent(ref.id)}`);
  const file = staticCardFile(locale, ref);
  const version = OG_CARD_VERSIONS[file];
  return version ? `${file}?v=${version}` : file;
}

/**
 * The image entry a page's `openGraph` and `twitter` metadata carry: the
 * card's absolute URL, its size and type, and the alt text "Obelisk preview
 * card: <title>" in the page's language (`title` as the tab renders it).
 */
export function ogImage(t: Translate, locale: Locale, ref: OgCardRef, title: string): PageImage {
  return { url: `${SITE_URL}${ogCardPath(locale, ref)}`, ...OG_SIZE, type: OG_TYPE, alt: t('seo.card.alt', { title }) };
}

/** Cut user text (a note, a bio) at a word boundary for a card; site copy is written to fit instead. */
export function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}
