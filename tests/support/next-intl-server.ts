/**
 * `next-intl/server` for vitest.
 *
 * The real module only works under React's `react-server` condition, which
 * vitest does not run. This stand-in has the same surface the app uses and
 * reads the real message files, so a `generateMetadata` or a server page
 * under test produces the same strings it does in production.
 * The calls that do not name a locale read the `[locale]` root param, as
 * `src/i18n/request.ts` does for real: a test sets it with `setRootLocale`
 * (`tests/support/root-params.ts`), and anything that is not one of ours
 * reads as English.
 */

import { createTranslator, createFormatter, type IntlError } from 'next-intl';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n';
import { currentRootLocale } from './root-params';
import { allMessages } from './messages';

/** The request's language, as `src/i18n/request.ts` resolves it; also read by the `IntlScope` stand-in. */
export function currentRequestLocale(): Locale {
  const segment = currentRootLocale();
  return isLocale(segment) ? segment : DEFAULT_LOCALE;
}

export async function getLocale(): Promise<Locale> {
  return currentRequestLocale();
}

type Opts = string | { locale?: string; namespace?: string } | undefined;

function localeOf(opts: Opts): Locale {
  const explicit = typeof opts === 'object' ? opts.locale : undefined;
  return isLocale(explicit) ? explicit : currentRequestLocale();
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
