/**
 * The request's language and translator, on the server.
 *
 * The locale is the URL's (`/es/...`), resolved by next-intl from the
 * `[locale]` segment; `t` reads every message module of that language.
 * A thin wrapper so the server components and `generateMetadata`
 * functions that already did `const { t, locale } = await serverLocale()`
 * keep reading the same way.
 */

import { getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n';

export async function serverLocale(): Promise<{
  locale: Locale;
  t: Awaited<ReturnType<typeof getTranslations<never>>>;
}> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations()]);
  return { locale, t };
}
