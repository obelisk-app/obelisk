/**
 * The request's language, on the server.
 *
 * Components get their copy from `useTranslation()`, which only exists in
 * the browser. Everything server-rendered — the public note, profile and
 * hashtag viewers, the relay landing pages, and every `generateMetadata`
 * in the tree — had no equivalent, so all of it was written in literal
 * English regardless of who was asking.
 *
 * The locale already reaches the server: `src/proxy.ts` resolves it from
 * geo and Accept-Language and sets `x-obelisk-locale`, with the cookie as
 * the user's explicit override. This is the same resolution `layout.tsx`
 * does, lifted out so a route can do `const { t } = await serverLocale()`
 * and translate the way a component does.
 *
 * Deliberately not memoized: `headers()` and `cookies()` are already
 * per-request in Next, and caching across requests here would serve one
 * reader's language to another.
 */

import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  getTranslation,
  isLocale,
  type Locale,
} from '@/i18n';

export async function serverLocale(): Promise<{ locale: Locale; t: (key: string) => string }> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const headerLocale = requestHeaders.get(LOCALE_HEADER);
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  // Header before cookie, matching layout.tsx: the proxy writes the header
  // from the cookie when there is one, so this order can't disagree with
  // itself — and a route that reads the cookie first would ignore a
  // language the proxy resolved for a first-time visitor.
  const locale: Locale = isLocale(headerLocale)
    ? headerLocale
    : isLocale(cookieLocale)
      ? cookieLocale
      : DEFAULT_LOCALE;

  return { locale, t: getTranslation(locale) };
}
