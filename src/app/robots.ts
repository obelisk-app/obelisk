import type { MetadataRoute } from 'next';

const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/moderation', '/invite/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
