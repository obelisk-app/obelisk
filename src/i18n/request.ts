/**
 * next-intl's per-request config. The language is read here, once, from the
 * `[locale]` root param (`next/root-params`; `[locale]/layout.tsx` is a root
 * layout, and next-intl's proxy rewrites `/app` to `/en/app` internally), so
 * no page or layout hands it on. The server gets every module of that one
 * language; what reaches the browser is decided per route by `IntlScope`.
 */

import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { locale as segmentLocale } from 'next/root-params';
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
 * An explicit `getTranslations({ locale })` (OG images, the manifest, the
 * root 404) wins over the segment, and is the only way a route handler
 * names one, since root params are not readable there. Outside `[locale]`
 * (the dev harness) there is no segment, and a segment that is not one of
 * ours (the layout 404s it) reads as English too.
 */
export default getRequestConfig(async ({ locale: explicit }) => {
  const requested: string | undefined = explicit ?? (await segmentLocale());
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: await loadMessages(locale), timeZone: 'UTC' };
});
