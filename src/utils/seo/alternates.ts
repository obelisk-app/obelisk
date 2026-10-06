/**
 * Canonical URLs, hreflang alternates and OpenGraph locales for a page
 * that exists in every language.
 *
 * English is unprefixed (`/guides`), Spanish and Portuguese carry their
 * prefix (`/es/guides`, `/pt/guides`); this is the rule next-intl's
 * `localePrefix: 'as-needed'` applies to links, restated here so metadata,
 * the sitemap and JSON-LD can build absolute URLs without a request.
 * `x-default` is the English URL: a visitor with no language signal gets
 * English there.
 */

import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n';

export const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';

/**
 * `hreflang`, JSON-LD `inLanguage` and `<html lang>`: the language alone.
 * One Spanish version serves every Spanish-speaking country and one
 * Portuguese version Brazil and Portugal; a region code (`es-AR`) would tell
 * search engines the page is for Argentina only, and a reader in Mexico or
 * Spain would be sent to the x-default (English) instead.
 */
export const HREFLANG: Record<Locale, string> = {
  en: 'en',
  es: 'es',
  pt: 'pt',
};

/**
 * OpenGraph `og:locale` values. The format needs a territory, and these name
 * the variety the copy is written in: Argentine Spanish, Brazilian Portuguese.
 */
export const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  es: 'es_AR',
  pt: 'pt_BR',
};

/** `/guides` in `es` is `/es/guides`; `/` in `pt` is `/pt`. */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

/** `/es/app` is `/app`, `/pt` is `/`: the same page with no language forced. */
export function unlocalizedPath(pathname: string): string {
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    if (pathname === `/${locale}`) return '/';
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

export function absoluteUrl(locale: Locale, path: string): string {
  const p = localizedPath(locale, path);
  return p === '/' ? SITE_URL : `${SITE_URL}${p}`;
}

/** `hreflang` -> absolute URL for every language, plus `x-default`. */
export function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[HREFLANG[l]] = absoluteUrl(l, path);
  languages['x-default'] = absoluteUrl(DEFAULT_LOCALE, path);
  return languages;
}

/**
 * `alternates` for `generateMetadata`: the canonical is this language's own
 * URL, and every language (plus x-default) is listed, the same set on all
 * three versions so each one confirms the others.
 */
export function localizedAlternates(locale: Locale, path: string) {
  return { canonical: absoluteUrl(locale, path), languages: languageAlternates(path) };
}

/** `openGraph.locale` and `alternateLocale` for one language. */
export function ogLocales(locale: Locale): { locale: string; alternateLocale: string[] } {
  return {
    locale: OG_LOCALE[locale],
    alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
  };
}
