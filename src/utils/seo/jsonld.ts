/**
 * JSON-LD nodes, in the page's language, with absolute canonical URLs.
 *
 * One Organization (La Crypta, which publishes Obelisk) is defined once per
 * page by the layout and referenced by `@id` everywhere else, so an
 * article's author and publisher are the same entity, not three copies.
 * Each type carries what Google requires of it; `scripts/seo/lib/jsonld.ts`
 * checks the rendered pages against the same rules.
 */

import type { Locale } from '@/i18n';
import { HREFLANG, SITE_URL, absoluteUrl } from './alternates';

export const SCHEMA = 'https://schema.org';
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

type Node = Record<string, unknown>;

/** La Crypta: the community behind Obelisk, its author and publisher. */
export function organizationNode(): Node {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'La Crypta',
    url: 'https://lacrypta.ar',
    logo: `${SITE_URL}/lacrypta-logo.png`,
  };
}

/** The `@id` of the site in one language: `https://obelisk.ar/#website`, `https://obelisk.ar/es#website`. */
export function websiteId(locale: Locale): string {
  const home = absoluteUrl(locale, '/');
  return `${home === SITE_URL ? `${SITE_URL}/` : home}#website`;
}

/** The site in one language: its home URL is that language's home. */
export function websiteNode(locale: Locale, description: string): Node {
  const home = absoluteUrl(locale, '/');
  return {
    '@type': 'WebSite',
    '@id': websiteId(locale),
    url: home,
    name: 'Obelisk',
    description,
    inLanguage: HREFLANG[locale],
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/**
 * The app itself, on the landing page only. Free, runs in any browser. No
 * rating or review: Google shows the software rich result only with one,
 * and ours would have to be invented.
 */
export function webApplicationNode(locale: Locale, description: string): Node {
  return {
    '@context': SCHEMA,
    '@type': 'WebApplication',
    '@id': `${SITE_URL}/#app`,
    name: 'Obelisk',
    url: absoluteUrl(locale, '/'),
    description,
    inLanguage: HREFLANG[locale],
    applicationCategory: 'CommunicationApplication',
    operatingSystem: 'Any',
    image: `${SITE_URL}/icon-512.png`,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/** FAQPage from the questions and answers exactly as the page shows them. */
export function faqJsonLd(items: ReadonlyArray<{ question: string; answer: string }>): Node {
  return {
    '@context': SCHEMA,
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/** A breadcrumb trail, home first; every step but the last links somewhere. */
export function breadcrumbJsonLd(items: ReadonlyArray<{ name: string; url: string }>): Node {
  return {
    '@context': SCHEMA,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** A page that lists other pages (the guides index), with the list itself. */
export function collectionJsonLd(p: {
  locale: Locale;
  url: string;
  name: string;
  description: string;
  items: ReadonlyArray<{ name: string; url: string }>;
}): Node {
  return {
    '@context': SCHEMA,
    '@type': 'CollectionPage',
    name: p.name,
    description: p.description,
    url: p.url,
    inLanguage: HREFLANG[p.locale],
    isPartOf: { '@id': websiteId(p.locale) },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: p.items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, url: item.url })),
    },
  };
}
