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

/** LATAM country codes that should default to Spanish */
export const LATAM_COUNTRIES = new Set([
  'AR', 'UY', 'PY', 'BO', 'CL', 'CO', 'VE', 'PE', 'EC', 'MX',
  'CU', 'CR', 'PA', 'HN', 'SV', 'GT', 'NI', 'DO', 'PR', 'ES',
]);

export function countryToLocale(countryCode: string | null): Locale {
  if (!countryCode) return DEFAULT_LOCALE;
  return LATAM_COUNTRIES.has(countryCode.toUpperCase()) ? 'es' : 'en';
}
