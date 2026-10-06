import type { MetadataRoute } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/i18n';

/**
 * The PWA manifest, described in the installing visitor's language (their
 * `locale` cookie; English without one). `start_url` stays `/app`: the
 * proxy sends a visitor whose cookie says Spanish to `/es/app`, so the
 * installed app opens in the language it was installed in.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  const t = await getTranslations({ locale });
  return {
    // Keep `name` short - Android Chrome renders it under the icon on the
    // PWA splash and clips anything that doesn't fit on one line. The longer
    // marketing string lives in `description` and the page metadata.
    name: 'Obelisk',
    short_name: 'Obelisk',
    description: t('seo.manifest.description'),
    lang: locale,
    // Land directly on the chat shell when the user opens the installed
    // app - bypassing the marketing landing page is the expected mobile
    // PWA behavior. `scope: '/'` keeps in-app navigation to the landing
    // pages, guides, etc. inside the standalone window.
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait-primary',
    categories: ['social', 'communication'],
    icons: [
      // Chrome's installability check looks for explicit 192x192 and
      // 512x512 entries. Without these, manifest validation passes but
      // the address-bar install icon never appears. The `any` icons are
      // generated from /public/obelisk-favicon.png at build-prep time.
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
