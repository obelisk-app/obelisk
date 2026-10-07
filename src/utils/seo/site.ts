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
import { ogLocales } from './alternates';
import { SITE_URL } from '@/constants/seo/alternates';
import { organizationNode, websiteNode } from './jsonld';
import { SCHEMA } from '@/constants/seo/jsonld';
import { SITE_NAME, X_HANDLE } from '@/constants/seo/page';

const KEYWORDS = [
  'Discord alternative', 'Nostr login', 'Nostr chat', 'Nostr Discord', 'no email no password chat',
  'private group chat', 'crypto community chat', 'decentralized Discord', 'self-hosted chat',
  'sovereign identity chat', 'NIP-07', 'NIP-46 bunker', 'Web of Trust',
  'open source Discord alternative', 'La Crypta',
];

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
    // The fallback for a page that sets none of its own (a 404); the
    // image comes from `[locale]/opengraph-image.tsx`. Every real page
    // builds its full card through `pageMetadata`, because Next replaces
    // `openGraph` and `twitter` wholesale rather than merging these in.
    openGraph: {
      title: t('seo.site.title'),
      description: t('seo.site.description'),
      siteName: SITE_NAME,
      ...ogLocales(locale),
      type: 'website',
    },
    twitter: { card: 'summary_large_image', site: X_HANDLE, creator: X_HANDLE },
    // Indexing is the default and needs no tag; a page that must stay out
    // sets `robots` itself (`noindexMetadata`), which replaces this whole
    // object. These are Google's preview allowances only.
    robots: {
      googleBot: { 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
  };
}

/**
 * `WebSite` + `Organization` on every page, in the page's language. The app
 * itself (`WebApplication`) is described on the landing page only.
 */
export function siteJsonLd(t: Translate, locale: Locale) {
  return {
    '@context': SCHEMA,
    '@graph': [websiteNode(locale, t('seo.site.jsonLd.websiteDescription')), organizationNode()],
  };
}

