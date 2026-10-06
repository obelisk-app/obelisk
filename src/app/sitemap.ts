import type { MetadataRoute } from 'next';
import { listAllGuides, listSlugs, type Guide } from '@/services/guides';
import { LOCALES, type Locale } from '@/i18n';
import { guidePath } from '@/utils/guides/guide-urls';
import { snapshotPaths } from '@/utils/guides/asset-meta';
import { SITE_URL, absoluteUrl, languageAlternates } from '@/utils/seo/alternates';

const ASSET_REF_RE = /<(?:Diagram|SvgHero)\s+[^>]*name=["']([^"']+)["']/g;

/** The guide's hero and inline diagrams, as the snapshots of its own language. */
function guideImageUrls(g: Guide, locale: Locale): string[] {
  const names = new Set<string>();
  if (g.frontmatter.heroComponent) names.add(g.frontmatter.heroComponent);
  for (const m of g.content.matchAll(ASSET_REF_RE)) names.add(m[1]);
  return Array.from(names).map((n) => `${SITE_URL}${snapshotPaths(n, locale).png}`);
}

type Freq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

/** The public pages, each listed once per language. */
const PAGES: ReadonlyArray<{ path: string; changeFrequency: Freq; priority: number }> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/app', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/mobile', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/desktop', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/features', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/help', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/help/local-data', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/media-kit', changeFrequency: 'monthly', priority: 0.5 },
  { path: guidePath(), changeFrequency: 'weekly', priority: 0.7 },
];

/**
 * Every page in every language (`/x`, `/es/x`, `/pt/x`), each entry
 * carrying the full set of hreflang alternates plus `x-default` (English),
 * so a crawler can pair the three versions from any one of them.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const out: MetadataRoute.Sitemap = [];

  for (const page of PAGES) {
    const alternates = { languages: languageAlternates(page.path) };
    for (const locale of LOCALES) {
      out.push({ url: absoluteUrl(locale, page.path), lastModified: now, changeFrequency: page.changeFrequency, priority: page.priority, alternates });
    }
  }

  // Slugs are shared across languages; a missing translation falls back to
  // English in `readGuide`, so every slug exists in every language.
  const slugs = await listSlugs('en').catch(() => []);
  for (const locale of LOCALES) {
    const guides = new Map((await listAllGuides(locale).catch(() => [])).map((g) => [g.slug, g]));
    for (const slug of slugs) {
      const g = guides.get(slug);
      out.push({
        url: absoluteUrl(locale, guidePath(slug)),
        lastModified: g?.frontmatter.updatedAt ? new Date(g.frontmatter.updatedAt) : now,
        changeFrequency: 'monthly',
        priority: 0.6,
        images: g ? guideImageUrls(g, locale) : undefined,
        alternates: { languages: languageAlternates(guidePath(slug)) },
      });
    }
  }
  return out;
}
