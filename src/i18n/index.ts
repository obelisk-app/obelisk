import en from './locales/en.json';
import es from './locales/es.json';

export type Locale = 'en' | 'es';
export type TranslationKey = keyof typeof en;

const dictionaries: Record<Locale, Record<string, string>> = { en, es };

export function getTranslation(locale: Locale) {
  const dict = dictionaries[locale] || dictionaries.es;
  return (key: string): string => dict[key] || key;
}

export const LOCALES: Locale[] = ['es', 'en'];
export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_COOKIE = 'locale';
export const LOCALE_HEADER = 'x-obelisk-locale';

/** LATAM country codes that should default to Spanish */
export const LATAM_COUNTRIES = new Set([
  'AR', 'UY', 'PY', 'BO', 'CL', 'CO', 'VE', 'PE', 'EC', 'MX',
  'CU', 'CR', 'PA', 'HN', 'SV', 'GT', 'NI', 'DO', 'PR', 'ES',
]);

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'es';
}

export function countryToLocale(countryCode: string | null): Locale {
  if (!countryCode) return DEFAULT_LOCALE;
  return LATAM_COUNTRIES.has(countryCode.toUpperCase()) ? 'es' : 'en';
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
    const primary = tag.split('-')[0];
    if (primary === 'es') return 'es';
    if (primary === 'en') return 'en';
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
