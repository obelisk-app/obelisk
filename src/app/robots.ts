import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/utils/seo/alternates';
import { buildRobots } from '@/utils/seo/robots';

export default function robots(): MetadataRoute.Robots {
  return buildRobots(SITE_URL);
}
