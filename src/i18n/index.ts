import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';

export type Locale = 'en' | 'es' | 'pt';
export type TranslationKey = keyof typeof en;

const dictionaries: Record<Locale, Record<string, string>> = { en, es, pt };

export function getTranslation(locale: Locale) {
  const dict = dictionaries[locale] || dictionaries.es;
  return (key: string): string => dict[key] || key;
}

export const LOCALES: Locale[] = ['es', 'en', 'pt'];
export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_COOKIE = 'locale';
export const LOCALE_HEADER = 'x-obelisk-locale';

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

/** Portuguese-speaking countries — Brazil first, since that's most of them. */
export const LUSOPHONE_COUNTRIES = new Set([
  'BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL', 'GQ',
]);

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value);
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

export function detectLocale(options: {
  cookieLocale?: string | null;
  countryCode?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(options.cookieLocale)) return options.cookieLocale;
  if (options.countryCode) return countryToLocale(options.countryCode);
  return acceptLanguageToLocale(options.acceptLanguage ?? null) ?? DEFAULT_LOCALE;
}
