/**
 * URL locales: English at `/`, Spanish at `/es`, Portuguese at `/pt`.
 *
 * `localeDetection` is off because the first-visit guess happens in
 * `src/proxy.ts` (only when there is no `locale` cookie, so a language the
 * user picked always wins). The cookie keeps the name the app always used;
 * next-intl rewrites it whenever the URL's language differs, which is what
 * makes the language picker a plain navigation. `alternateLinks` is off
 * because every page emits its hreflang alternates in its own metadata.
 */

import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES } from './index';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeDetection: false,
  alternateLinks: false,
  localeCookie: { name: LOCALE_COOKIE, maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' },
});
