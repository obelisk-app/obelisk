import { LOCALES, type Locale } from '@/i18n';

/**
 * English is the default locale and has no URL prefix; every other language
 * is served under `/guides/<locale>`.
 *
 * This used to be `locale === 'en' ? '/guides' : '/guides/es'`, which sent
 * any third language to the Spanish articles — and compiled fine while
 * doing it.
 */
export function guidesHref(locale: Locale, slug?: string): string {
  const base = locale === 'en' ? '/guides' : `/guides/${locale}`;
  return slug ? `${base}/${slug}` : base;
}

/**
 * BCP-47 tags for `hreflang` and OpenGraph.
 *
 * These were two-entry literals repeated in the guides index, the article
 * page and the root layout, so a third language was invisible to crawlers
 * even once its pages existed.
 */
export const HREFLANG: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-AR',
  pt: 'pt-BR',
};

export const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  es: 'es_AR',
  pt: 'pt_BR',
};

/** `hreflang` map for a page that exists in every language. */
export function guideAlternates(slug?: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[HREFLANG[locale]] = guidesHref(locale, slug);
  languages['x-default'] = guidesHref('en', slug);
  return languages;
}
