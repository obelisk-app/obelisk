import type { MetadataRoute } from 'next';
import { listAllGuides } from '@/lib/guides';
import type { Locale } from '@/i18n';

const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';
const LOCALES: Locale[] = ['en', 'es'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const base: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/chat`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  const guideIndexes: MetadataRoute.Sitemap = LOCALES.map((locale) => ({
    url: `${SITE_URL}/guides/${locale}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
    alternates: {
      languages: {
        en: `${SITE_URL}/guides/en`,
        es: `${SITE_URL}/guides/es`,
      },
    },
  }));

  const guideArticles: MetadataRoute.Sitemap = [];
  for (const locale of LOCALES) {
    const guides = await listAllGuides(locale).catch(() => []);
    for (const g of guides) {
      const last = g.frontmatter.updatedAt
        ? new Date(g.frontmatter.updatedAt)
        : now;
      guideArticles.push({
        url: `${SITE_URL}/guides/${locale}/${g.slug}`,
        lastModified: last,
        changeFrequency: 'monthly',
        priority: 0.6,
        alternates: {
          languages: {
            en: `${SITE_URL}/guides/en/${g.slug}`,
            es: `${SITE_URL}/guides/es/${g.slug}`,
          },
        },
      });
    }
  }

  return [...base, ...guideIndexes, ...guideArticles];
}
