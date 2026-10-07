/**
 * SEO: alternates. Values the code in `utils/seo/alternates.ts` reads, kept
 * here so every reader imports the one copy.
 */

import type { Locale } from '@/i18n';

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

export const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';
