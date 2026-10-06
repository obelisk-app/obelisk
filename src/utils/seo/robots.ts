/**
 * robots.txt: crawl everything except the API and the dev harness, and say
 * where the sitemap is.
 *
 * Pages that must stay out of search (`/app`, `/voice`, share links, the
 * relay-content viewers) are not blocked here: a crawler that may not fetch
 * a page never reads its `noindex`, and a blocked URL can still be indexed
 * from links alone. They answer with `noindex, follow` instead.
 */

import type { MetadataRoute } from 'next';

export function buildRobots(siteUrl: string): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/dev/'] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
