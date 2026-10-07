/**
 * Dates, times and numbers in the app's language.
 *
 * Every call site used to be a bare `toLocaleDateString()` with no locale
 * argument, which does not mean "the app's language"; it means the
 * *operating system's*. So an article read in Spanish printed its date in
 * whatever the browser was installed as, and switching the app's language
 * changed nothing. That was already wrong before Portuguese existed.
 *
 * The locale a component has is our `Locale` union ('en' | 'es' | 'pt'),
 * which is not what `Intl` wants; `INTL_LOCALE` names the regional variety
 * the copy is written in (Argentine Spanish, Brazilian Portuguese), so
 * dates and numbers read the way the sentences around them do. The page
 * head's `hreflang` is the plain language instead (`src/utils/seo/alternates.ts`):
 * that one says who the page is for, this one how to write a date.
 *
 * Use `useFormat()` from a component. These functions take the locale
 * explicitly so server-rendered pages can use them too, with the locale
 * from `serverLocale()`.
 */

import { DEFAULT_LOCALE, type Locale } from '@/i18n';

/** The BCP-47 tag `Intl` formats with, per language. */
const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', es: 'es-AR', pt: 'pt-BR' };

/** The BCP-47 tag `Intl` expects for one of our locales. */
export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale] ?? INTL_LOCALE[DEFAULT_LOCALE];
}

type When = Date | number;

/** Seconds are the Nostr unit; milliseconds are the JS one. Accept both. */
function toDate(value: When): Date {
  if (value instanceof Date) return value;
  // A timestamp below ~Sep 2001 in milliseconds is almost certainly seconds.
  return new Date(value < 1e12 ? value * 1000 : value);
}

const DEFAULT_DATE: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

export function formatDate(
  locale: Locale,
  value: When,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE,
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(toDate(value));
}

export function formatTime(
  locale: Locale,
  value: When,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(toDate(value));
}

export function formatDateTime(
  locale: Locale,
  value: When,
  options: Intl.DateTimeFormatOptions = {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(toDate(value));
}

/** Sats, counts, anything with a thousands separator that differs by language. */
export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}
