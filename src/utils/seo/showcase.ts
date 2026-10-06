/**
 * Metadata and `ImageGallery` JSON-LD for the two screenshot tours,
 * `/desktop` and `/mobile`, in the page's language. Copy comes from
 * `seo.desktop.*` / `seo.mobile.*`; the keyword lists stay English (search
 * terms, see docs/i18n.md).
 */

import type { Metadata } from 'next';
import type { Locale } from '@/i18n';
import type { MessageKey, Translate } from '@/i18n/keys';
import { HREFLANG, SITE_URL, absoluteUrl } from './alternates';
import { SCHEMA } from './jsonld';
import { standardPageMetadata } from './standard';

export type Shot = { path: string; nameKey: MessageKey; width: number; height: number };

export type Tour = {
  page: 'desktop' | 'mobile';
  shots: readonly Shot[];
  keywords: readonly string[];
};

export function tourMetadata(tour: Tour, t: Translate, locale: Locale): Metadata {
  return standardPageMetadata(t, locale, tour.page, `/${tour.page}`, { keywords: tour.keywords });
}

export function tourJsonLd(tour: Tour, t: Translate, locale: Locale) {
  const k = (leaf: string) => `seo.${tour.page}.gallery.${leaf}` as MessageKey;
  return {
    '@context': SCHEMA,
    '@type': 'ImageGallery',
    name: t(k('name')),
    description: t(k('description')),
    url: absoluteUrl(locale, `/${tour.page}`),
    inLanguage: HREFLANG[locale],
    image: tour.shots.map((s) => ({
      '@type': 'ImageObject',
      contentUrl: `${SITE_URL}${s.path}`,
      url: `${SITE_URL}${s.path}`,
      width: s.width,
      height: s.height,
      name: t(k('shot'), { name: t(s.nameKey) }),
    })),
  };
}
