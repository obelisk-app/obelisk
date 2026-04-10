import type { MetadataRoute } from 'next';

const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
