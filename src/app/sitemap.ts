import type { MetadataRoute } from 'next';
import { listAllGuides } from '@/lib/guides';
import type { Locale } from '@/i18n';
import { guidesHref } from '@/lib/guide-urls';

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
    {
      url: `${SITE_URL}/mobile`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/desktop`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  const guideIndexes: MetadataRoute.Sitemap = LOCALES.map((locale) => ({
    url: `${SITE_URL}${guidesHref(locale)}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
    alternates: {
      languages: {
        'en-US': `${SITE_URL}${guidesHref('en')}`,
        'es-AR': `${SITE_URL}${guidesHref('es')}`,
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
        url: `${SITE_URL}${guidesHref(locale, g.slug)}`,
        lastModified: last,
        changeFrequency: 'monthly',
        priority: 0.6,
        alternates: {
          languages: {
            'en-US': `${SITE_URL}${guidesHref('en', g.slug)}`,
            'es-AR': `${SITE_URL}${guidesHref('es', g.slug)}`,
          },
        },
      });
    }
  }

  return [...base, ...guideIndexes, ...guideArticles];
}
