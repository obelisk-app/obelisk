import type { MetadataRoute } from 'next';
import { listAllGuides, listSlugs } from '@/services/guides/guides';
import { LOCALES, type Locale } from '@/i18n';
import { SHOT_META } from '@/components/guides/mdx/Shot';
import { guideImages } from '@/utils/seo/guide';
import { buildSitemap, type SitemapGuide } from '@/utils/seo/sitemap';

/**
 * Reads every guide in every language (slugs are shared; a missing
 * translation falls back to English in `readGuide`, so every slug exists in
 * every language) and hands the dates and images to `buildSitemap`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listSlugs('en').catch(() => []);
  const byLocale = {} as Record<Locale, SitemapGuide[]>;
  for (const locale of LOCALES) {
    const guides = new Map((await listAllGuides(locale).catch(() => [])).map((g) => [g.slug, g]));
    byLocale[locale] = slugs.flatMap((slug) => {
      const g = guides.get(slug);
      if (!g) return [];
      const images = guideImages(g.frontmatter.heroComponent, g.content, locale, SHOT_META).map((img) => img.url);
      return [{ slug, updatedAt: g.frontmatter.updatedAt, images }];
    });
  }
  return buildSitemap(byLocale);
}
