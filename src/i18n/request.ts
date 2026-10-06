/**
 * next-intl's per-request config: the locale comes from the `[locale]`
 * segment (next-intl's middleware rewrites `/app` to `/en/app` internally),
 * and the server gets every module of that one language. What reaches the
 * browser is decided per route by `IntlScope`.
 */

import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import { MODULES, type Module } from './modules';
import type { Locale } from './index';

async function loadModule(locale: Locale, module: Module): Promise<Record<string, unknown>> {
  return (await import(`./messages/${locale}/${module}.json`)).default;
}

export async function loadMessages(locale: Locale): Promise<Record<Module, Record<string, unknown>>> {
  const loaded = await Promise.all(MODULES.map(async (m) => [m, await loadModule(locale, m)] as const));
  return Object.fromEntries(loaded) as Record<Module, Record<string, unknown>>;
}

/**
 * An explicit `getTranslations({ locale })` (metadata, OG images, the
 * manifest) wins over the segment; outside `[locale]` (the dev harness,
 * the manifest) there is no segment and English is used.
 */
export default getRequestConfig(async ({ requestLocale, locale: explicit }) => {
  const requested = explicit ?? (await requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: await loadMessages(locale), timeZone: 'UTC' };
});
