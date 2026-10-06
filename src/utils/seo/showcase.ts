/**
 * Metadata and `ImageGallery` JSON-LD for the two screenshot tours,
 * `/desktop` and `/mobile`, in the page's language. Copy comes from
 * `seo.desktop.*` / `seo.mobile.*`; the keyword lists stay English (search
 * terms, see docs/i18n.md).
 */

import type { Metadata } from 'next';
import type { Locale } from '@/i18n';
import type { MessageKey, Translate } from '@/i18n/keys';
import { SITE_URL, absoluteUrl, localizedAlternates, ogLocales } from './alternates';

export type Shot = { path: string; nameKey: MessageKey; width: number; height: number };

export type Tour = {
  page: 'desktop' | 'mobile';
  shots: readonly Shot[];
  ogImage: { url: string; width: number; height: number };
  twitterImage: string;
  keywords: readonly string[];
};

export function tourMetadata(tour: Tour, t: Translate, locale: Locale): Metadata {
  const k = (leaf: string) => `seo.${tour.page}.${leaf}` as MessageKey;
  const title = t(k('title'));
  const ogTitle = tour.page === 'mobile' ? t('seo.mobile.ogTitle') : title;
  return {
    title,
    description: t(k('description')),
    alternates: localizedAlternates(locale, `/${tour.page}`),
    keywords: [...tour.keywords],
    openGraph: {
      title: ogTitle,
      description: t(k('ogDescription')),
      url: absoluteUrl(locale, `/${tour.page}`),
      ...ogLocales(locale),
      type: 'website',
      images: [{ ...tour.ogImage, alt: t(k('imageAlt')) }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: t(k('twitterDescription')),
      images: [tour.twitterImage],
    },
  };
}

export function tourJsonLd(tour: Tour, t: Translate, locale: Locale) {
  const k = (leaf: string) => `seo.${tour.page}.gallery.${leaf}` as MessageKey;
  return {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: t(k('name')),
    description: t(k('description')),
    url: absoluteUrl(locale, `/${tour.page}`),
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
