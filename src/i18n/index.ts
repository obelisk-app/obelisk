/**
 * The three languages, and how a first-time visitor's one is guessed.
 *
 * English is the default and lives at the unprefixed URLs (`/`, `/app`);
 * Spanish and Portuguese live under `/es` and `/pt`. The copy itself is in
 * `messages/<locale>/<module>.json`, loaded through next-intl (`request.ts`
 * on the server, `IntlScope` for each route's client tree).
 */

export const LOCALES = ['en', 'es', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'locale';

/**
 * Where each language is spoken, for geo defaults.
 *
 * Brazil used to land on English: it isn't in the LATAM set (which is
 * Spanish-speaking Latin America plus Spain), and the fallback was binary.
 */
export const LATAM_COUNTRIES = new Set([
  'AR', 'UY', 'PY', 'BO', 'CL', 'CO', 'VE', 'PE', 'EC', 'MX',
  'CU', 'CR', 'PA', 'HN', 'SV', 'GT', 'NI', 'DO', 'PR', 'ES',
]);

/** Portuguese-speaking countries, Brazil first, since that's most of them. */
export const LUSOPHONE_COUNTRIES = new Set([
  'BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL', 'GQ',
]);

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function countryToLocale(countryCode: string | null): Locale {
  if (!countryCode) return DEFAULT_LOCALE;
  const code = countryCode.toUpperCase();
  if (LUSOPHONE_COUNTRIES.has(code)) return 'pt';
  return LATAM_COUNTRIES.has(code) ? 'es' : 'en';
}

export function acceptLanguageToLocale(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null;

  const languages = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.reduce((score, param) => {
        const match = param.trim().match(/^q=([0-9.]+)$/);
        return match ? Number(match[1]) : score;
      }, 1);
      return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter(({ tag, q }) => tag && q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of languages) {
    // `pt-BR` and `pt-PT` both resolve to the one Portuguese we ship.
    const primary = tag.split('-')[0];
    if (isLocale(primary)) return primary;
  }

  return null;
}

/**
 * A first-time visitor's language: the explicit cookie, then the country
 * the CDN says the request came from, then the browser's Accept-Language.
 * With no signal at all (a crawler) the answer is English, so `/` is
 * indexed in English.
 */
export function detectLocale(options: {
  cookieLocale?: string | null;
  countryCode?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(options.cookieLocale)) return options.cookieLocale;
  if (options.countryCode) return countryToLocale(options.countryCode);
  return acceptLanguageToLocale(options.acceptLanguage ?? null) ?? DEFAULT_LOCALE;
}
