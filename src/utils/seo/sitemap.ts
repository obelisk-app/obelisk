/**
 * The sitemap: every page that should be in search, in every language,
 * each entry with the full set of hreflang alternates plus x-default
 * (English), so a crawler can pair the three versions from any one of them.
 *
 * `lastmod` is a real date or nothing. A guide carries its front matter's
 * `updatedAt`; the guides index carries its newest guide's. The other pages
 * have no recorded modification date, and stamping them with the build's
 * clock told search engines every page changed on every deploy, which
 * teaches them to ignore the field; they carry none.
 *
 * Not listed, on purpose: `/app` (a client-drawn login screen), the voice
 * forms, share links and the relay-content viewers (`/notes`, `/p`, `/t`),
 * all `noindex`. A sitemap lists only what should be indexed.
 */

import type { MetadataRoute } from 'next';
import { LOCALES, type Locale } from '@/i18n';
import { guidePath } from '@/utils/guides/guide-urls';
import { absoluteUrl, languageAlternates } from './alternates';

type Freq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

/** The indexable pages besides the guides themselves. */
export const SITEMAP_PAGES: ReadonlyArray<{ path: string; changeFrequency: Freq; priority: number }> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/features', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/mobile', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/desktop', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/help', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/help/local-data', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/media-kit', changeFrequency: 'monthly', priority: 0.5 },
  { path: guidePath(), changeFrequency: 'weekly', priority: 0.7 },
];

/** One guide in one language, as the sitemap needs it. */
export type SitemapGuide = { slug: string; updatedAt: string; images: string[] };

/** The newest `updatedAt` among these guides, or none. */
export function latestUpdate(guides: ReadonlyArray<{ updatedAt: string }>): string | undefined {
  return guides.map((g) => g.updatedAt).filter(Boolean).sort().pop();
}

export function buildSitemap(guidesByLocale: Record<Locale, SitemapGuide[]>): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  for (const page of SITEMAP_PAGES) {
    const alternates = { languages: languageAlternates(page.path) };
    for (const locale of LOCALES) {
      const lastModified = page.path === guidePath() ? latestUpdate(guidesByLocale[locale]) : undefined;
      out.push({
        url: absoluteUrl(locale, page.path),
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates,
      });
    }
  }
  for (const locale of LOCALES) {
    for (const g of guidesByLocale[locale]) {
      out.push({
        url: absoluteUrl(locale, guidePath(g.slug)),
        ...(g.updatedAt ? { lastModified: g.updatedAt } : {}),
        changeFrequency: 'monthly',
        priority: 0.6,
        ...(g.images.length ? { images: g.images } : {}),
        alternates: { languages: languageAlternates(guidePath(g.slug)) },
      });
    }
  }
  return out;
}
