/**
 * The metadata of one page, built in one place so no page can forget a
 * piece of it.
 *
 * Next.js replaces `openGraph`, `twitter` and `robots` wholesale when a
 * page sets them (the layout's values are not merged in), which is how
 * pages used to lose their image, `og:site_name` or `og:url`. Every page
 * now passes its copy here and gets the full set back:
 *
 * - an indexed page: canonical in its own language, hreflang for all three
 *   plus x-default, `og:url` equal to the canonical, `og:locale` and its
 *   alternates, its own 1200x630 card with size, type and alt text, and the
 *   Twitter card;
 * - a page kept out of search (`noindexMetadata`): `noindex, follow`, no
 *   canonical or hreflang (they would contradict the noindex), but still the
 *   full card with `og:url`, because these pages are shared as links.
 *
 * The title a link preview shows is the one the tab shows ("… · Obelisk"),
 * and the description is the meta description: one string each, written to
 * fit a search result (45 to 57 and 145 to 157 characters, checked by
 * `npm run seo:check`).
 */

import type { Metadata } from 'next';
import type { Locale } from '@/i18n';
import { absoluteUrl, localizedAlternates, ogLocales } from './alternates';

export const SITE_NAME = 'Obelisk';
/** What the layout's title template appends; `%s · Obelisk`. */
export const TITLE_SUFFIX = ' · Obelisk';
/** The X account behind the site: La Crypta, Obelisk's publisher (the only handle the project names). */
export const X_HANDLE = '@lacryptaar';

export type PageImage = { url: string; width: number; height: number; alt: string; type: string };

/** The `<title>` as rendered: with the template suffix, unless the page opts out. */
export function renderedTitle(title: string, absolute = false): string {
  return absolute ? title : `${title}${TITLE_SUFFIX}`;
}

function twitter(title: string, description: string | undefined, image: PageImage) {
  return {
    card: 'summary_large_image' as const,
    site: X_HANDLE,
    creator: X_HANDLE,
    title,
    ...(description ? { description } : {}),
    images: [{ url: image.url, alt: image.alt }],
  };
}

function openGraph(p: { locale: Locale; path: string; title: string; description?: string; image: PageImage; type?: string }) {
  return {
    title: p.title,
    ...(p.description ? { description: p.description } : {}),
    url: absoluteUrl(p.locale, p.path),
    siteName: SITE_NAME,
    ...ogLocales(p.locale),
    images: [p.image],
  };
}

export type PageSeo = {
  locale: Locale;
  /** Locale-free path: `/guides/vesta`, not `/es/guides/vesta`. */
  path: string;
  /** The `<title>` before the layout's " · Obelisk"; `absoluteTitle` skips the template. */
  title: string;
  absoluteTitle?: boolean;
  description: string;
  image: PageImage;
  type?: 'website' | 'article';
  article?: { publishedTime: string; modifiedTime: string; tags?: readonly string[] };
  /** Search terms, not copy: they stay English (docs/i18n.md). */
  keywords?: readonly string[];
};

export function pageMetadata(p: PageSeo): Metadata {
  const full = renderedTitle(p.title, p.absoluteTitle);
  const og = openGraph({ ...p, title: full });
  return {
    title: p.absoluteTitle ? { absolute: p.title } : p.title,
    description: p.description,
    alternates: localizedAlternates(p.locale, p.path),
    ...(p.keywords ? { keywords: [...p.keywords] } : {}),
    openGraph: p.type === 'article' && p.article
      ? {
        ...og,
        type: 'article',
        publishedTime: p.article.publishedTime,
        modifiedTime: p.article.modifiedTime,
        ...(p.article.tags?.length ? { tags: [...p.article.tags] } : {}),
      }
      : { ...og, type: 'website' },
    twitter: twitter(full, p.description, p.image),
  };
}

export type NoindexSeo = {
  locale: Locale;
  /** The page's own path, locale-free (`/r/lacrypta`); becomes `og:url`. */
  path: string;
  title: string;
  description?: string;
  image: PageImage;
  type?: 'website' | 'article' | 'profile';
};

/** `noindex, follow`: links on the page still count, the page itself stays out of results. */
export const NOINDEX: NonNullable<Metadata['robots']> = { index: false, follow: true };

export function noindexMetadata(p: NoindexSeo): Metadata {
  const full = renderedTitle(p.title);
  return {
    title: p.title,
    ...(p.description ? { description: p.description } : {}),
    robots: NOINDEX,
    openGraph: { ...openGraph({ ...p, title: full }), type: p.type ?? 'website' },
    twitter: twitter(full, p.description, p.image),
  };
}
