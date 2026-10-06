/**
 * `next-intl/server` for vitest.
 *
 * The real module only works under React's `react-server` condition, which
 * vitest does not run. This stand-in has the same surface the app uses and
 * reads the real message files, so a `generateMetadata` or a server page
 * under test produces the same strings it does in production.
 * `setRequestLocale` (what `pageLocale` calls) decides the locale for the
 * calls that do not name one, as the `[locale]` segment does for real.
 */

import { createTranslator, createFormatter, type IntlError } from 'next-intl';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n';
import { allMessages } from './messages';

let requestLocale: Locale = DEFAULT_LOCALE;

export function setRequestLocale(locale: string): void {
  if (isLocale(locale)) requestLocale = locale;
}

/** The locale `setRequestLocale` last set, for the `IntlScope` stand-in. */
export function currentRequestLocale(): Locale {
  return requestLocale;
}

export async function getLocale(): Promise<Locale> {
  return requestLocale;
}

type Opts = string | { locale?: string; namespace?: string } | undefined;

function localeOf(opts: Opts): Locale {
  const explicit = typeof opts === 'object' ? opts.locale : undefined;
  return isLocale(explicit) ? explicit : requestLocale;
}

function fail(error: IntlError): void {
  throw error;
}

export async function getTranslations(opts?: Opts) {
  const locale = localeOf(opts);
  const namespace = typeof opts === 'string' ? opts : opts?.namespace;
  return createTranslator({ locale, messages: allMessages(locale), namespace: namespace as never, onError: fail });
}

export async function getMessages(opts?: { locale?: string }) {
  return allMessages(localeOf(opts));
}

export async function getFormatter(opts?: { locale?: string }) {
  return createFormatter({ locale: localeOf(opts), timeZone: 'UTC' });
}

export async function getNow() {
  return new Date();
}

export async function getTimeZone() {
  return 'UTC';
}

export function getRequestConfig<T>(fn: T): T {
  return fn;
}
