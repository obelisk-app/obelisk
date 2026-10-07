/**
 * Search metadata and JSON-LD for one guide, from its front matter, in its
 * language.
 *
 * A guide's `description` is the lede under its title, two or three
 * sentences long; search results cut a description at about 160
 * characters, so the front matter carries a `seoDescription` written to
 * fit, and a `seoTitle` where the title alone is too short or too long for
 * a result. Both fall back to the plain fields. Dates are the front
 * matter's `publishedAt` / `updatedAt`, never the build's clock.
 */

import type { Metadata } from 'next';
import type { Locale } from '@/i18n';
import type { MessageKey, Translate } from '@/i18n/keys';
import { guidePath } from '@/utils/guides/guide-urls';
import { snapshotPaths } from '@/utils/guides/asset-meta';
import { DIAGRAM_ASSET_META, HERO_ASSET_META } from '@/constants/guides/asset-meta';
import { absoluteUrl } from './alternates';
import { SITE_URL, HREFLANG } from '@/constants/seo/alternates';
import { breadcrumbJsonLd, websiteId } from './jsonld';
import { ORGANIZATION_ID, SCHEMA } from '@/constants/seo/jsonld';
import { cardAlt, cardImage } from './og';
import { pageMetadata, renderedTitle, type PageImage } from './page';

/** The front-matter fields this module reads. */
export type GuideSeoFields = {
  title: string;
  description: string;
  seoTitle?: string;
  seoDescription?: string;
  heroComponent: string;
  publishedAt: string;
  updatedAt: string;
  tags?: string[];
};

export type ImageSize = { width: number; height: number; altKey: MessageKey };

const ASSET_REF_RE = /<(?:Diagram|SvgHero)\s+[^>]*name=["']([^"']+)["']/g;
const SHOT_REF_RE = /<Shot\s+[^>]*name=["']([^"']+)["']/g;

/** The title and description a search result shows. */
export function guideSeoText(fm: GuideSeoFields): { title: string; description: string } {
  return { title: fm.seoTitle ?? fm.title, description: fm.seoDescription ?? fm.description };
}

/** The guide's card image: its hero in the guide's language, else the generated card. */
export function guideHero(fm: GuideSeoFields, locale: Locale, slug: string, t: Translate): PageImage {
  const meta = HERO_ASSET_META[fm.heroComponent];
  if (!meta) {
    return { url: `${absoluteUrl(locale, guidePath(slug))}/opengraph-image`, width: 1200, height: 630, alt: fm.title, type: 'image/png' };
  }
  // The snapshots are rendered at twice the artwork's CSS size.
  return { url: `${SITE_URL}${snapshotPaths(fm.heroComponent, locale).png}`, width: meta.width * 2, height: meta.height * 2, alt: t(meta.altKey), type: 'image/png' };
}

/**
 * Every picture in the guide, as absolute URLs in the guide's language: the
 * hero, the diagrams, and the screenshots (`shots`, keyed by name).
 */
export function guideImages(
  heroName: string | undefined,
  content: string,
  locale: Locale,
  shots: Record<string, ImageSize>,
): Array<{ url: string } & ImageSize> {
  const names = new Set<string>();
  if (heroName) names.add(heroName);
  for (const m of content.matchAll(ASSET_REF_RE)) names.add(m[1]);
  const out: Array<{ url: string } & ImageSize> = [];
  for (const n of names) {
    const meta = HERO_ASSET_META[n] ?? DIAGRAM_ASSET_META[n];
    if (meta) out.push({ url: `${SITE_URL}${snapshotPaths(n, locale).png}`, width: meta.width, height: meta.height, altKey: meta.altKey });
  }
  for (const m of content.matchAll(SHOT_REF_RE)) {
    const meta = shots[m[1]];
    if (meta) out.push({ url: `${SITE_URL}/og/guides/${m[1]}.png`, ...meta });
  }
  return out;
}

export function guideMetadata(p: { locale: Locale; slug: string; fm: GuideSeoFields; t: Translate }): Metadata {
  const { title, description } = guideSeoText(p.fm);
  const path = guidePath(p.slug);
  return pageMetadata({
    locale: p.locale,
    path,
    title,
    description,
    // The guide's own 1200x630 card (`[slug]/opengraph-image.tsx`), in its
    // language; the hero artwork is 2:1, which previews crop.
    image: cardImage(p.locale, path, cardAlt(p.t, renderedTitle(title))),
    type: 'article',
    article: { publishedTime: p.fm.publishedAt, modifiedTime: p.fm.updatedAt, tags: p.fm.tags },
    keywords: p.fm.tags,
  });
}

/** `Article` + `BreadcrumbList` (home, guides, this guide) for one guide. */
export function guideJsonLd(p: {
  locale: Locale;
  slug: string;
  fm: GuideSeoFields;
  content: string;
  t: Translate;
  shots: Record<string, ImageSize>;
  homeName: string;
  guidesName: string;
}) {
  const url = absoluteUrl(p.locale, guidePath(p.slug));
  const hero = guideHero(p.fm, p.locale, p.slug, p.t);
  const others = guideImages(p.fm.heroComponent, p.content, p.locale, p.shots).filter((img) => img.url !== hero.url);
  const image = (i: { url: string; width: number; height: number; caption: string }) => ({ '@type': 'ImageObject', ...i });
  const article = {
    '@context': SCHEMA,
    '@type': 'Article',
    headline: p.fm.title,
    description: guideSeoText(p.fm).description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: HREFLANG[p.locale],
    datePublished: p.fm.publishedAt,
    dateModified: p.fm.updatedAt,
    image: [
      image({ url: hero.url, width: hero.width, height: hero.height, caption: hero.alt }),
      ...others.map((img) => image({ url: img.url, width: img.width * 2, height: img.height * 2, caption: p.t(img.altKey) })),
    ],
    author: { '@id': ORGANIZATION_ID, '@type': 'Organization', name: 'La Crypta', url: 'https://lacrypta.ar', logo: `${SITE_URL}/lacrypta-logo.png` },
    publisher: { '@id': ORGANIZATION_ID },
    isPartOf: { '@id': websiteId(p.locale) },
    ...(p.fm.tags?.length ? { keywords: p.fm.tags.join(', ') } : {}),
  };
  const breadcrumb = breadcrumbJsonLd([
    { name: p.homeName, url: absoluteUrl(p.locale, '/') },
    { name: p.guidesName, url: absoluteUrl(p.locale, guidePath()) },
    { name: p.fm.title, url },
  ]);
  return [article, breadcrumb];
}
