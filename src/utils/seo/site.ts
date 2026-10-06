/**
 * The site-wide metadata and JSON-LD every page inherits from the
 * `[locale]` layout, in the page's language. Every string comes from the
 * `seo` module; the keyword list stays English on purpose (those are the
 * search terms people type, see docs/i18n.md).
 *
 * No `alternates` and no `openGraph.url` here: a layout's values are
 * inherited by every page that does not set its own, so a canonical in the
 * layout would claim `/` for pages that forgot theirs. Each page sets its
 * own through `localizedAlternates`.
 */

import type { Metadata } from 'next';
import type { Locale } from '@/i18n';
import type { Translate } from '@/i18n/keys';
import { HREFLANG, SITE_URL, absoluteUrl, ogLocales } from './alternates';

const KEYWORDS = [
  'Discord alternative', 'Nostr login', 'Nostr chat', 'Nostr Discord', 'no email no password chat',
  'private group chat', 'crypto community chat', 'decentralized Discord', 'self-hosted chat',
  'sovereign identity chat', 'NIP-07', 'NIP-46 bunker', 'Web of Trust',
  'open source Discord alternative', 'La Crypta',
];

export const OG_IMAGE = '/og/obelisk.png?v=2';

export function siteMetadata(t: Translate, locale: Locale): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t('seo.site.title'), template: '%s · Obelisk' },
    description: t('seo.site.description'),
    applicationName: 'Obelisk',
    keywords: KEYWORDS,
    authors: [{ name: 'La Crypta', url: 'https://lacrypta.ar' }],
    creator: 'La Crypta',
    publisher: 'La Crypta',
    category: 'social',
    referrer: 'origin-when-cross-origin',
    formatDetection: { email: false, address: false, telephone: false },
    icons: {
      // Small detail-rich favicon for tabs; iOS "Add to Home Screen" uses
      // the same vibrant icon as the Android PWA (iOS rounds the corners).
      icon: '/obelisk-favicon.png',
      shortcut: '/obelisk-favicon.png',
      apple: '/icon-512.png',
    },
    manifest: '/manifest.webmanifest',
    openGraph: {
      title: t('seo.site.ogTitle'),
      description: t('seo.site.ogDescription'),
      siteName: 'Obelisk',
      ...ogLocales(locale),
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630, type: 'image/png', alt: t('seo.site.ogImageAlt') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('seo.site.ogTitle'),
      description: t('seo.site.twitterDescription'),
      creator: '@lacryptaar',
      images: [OG_IMAGE],
    },
    robots: {
      index: true,
      follow: true,
      nocache: false,
      googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
  };
}

/** `WebSite` + `Organization` + `SoftwareApplication`, in the page's language. */
export function siteJsonLd(t: Translate, locale: Locale) {
  const home = absoluteUrl(locale, '/');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: home,
        name: 'Obelisk',
        description: t('seo.site.jsonLd.websiteDescription'),
        inLanguage: HREFLANG[locale],
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'La Crypta',
        url: 'https://lacrypta.ar',
        logo: `${SITE_URL}/icon-512.png`,
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Obelisk',
        applicationCategory: 'CommunicationApplication',
        operatingSystem: 'Web',
        description: t('seo.site.jsonLd.appDescription'),
        inLanguage: HREFLANG[locale],
        url: home,
        image: `${SITE_URL}/icon-512.png`,
        author: { '@id': `${SITE_URL}/#organization` },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    ],
  };
}

/**
 * PWA route guard: an installed app opened on the landing page (`/`,
 * `/es`, `/pt`) jumps straight to the chat shell in the same language, so
 * the marketing hero does not flash before the shell mounts.
 */
export const PWA_ROUTE_GUARD = `(function(){try{var s=(typeof matchMedia==='function'&&matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;var m=location.pathname.match(/^\\/(es|pt)?\\/?$/);if(s&&m){location.replace((m[1]?'/'+m[1]:'')+'/app'+location.search+location.hash);}}catch(e){}})();`;
