import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { locale as segmentLocale } from 'next/root-params';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALES, isLocale } from '@/i18n';
import IntlScope from '@/i18n/IntlScope';
import { siteJsonLd, siteMetadata } from '@/utils/seo/site';
import ToastStack from '@/components/feedback/ToastStack';
import { ConfirmDialogHost } from '@/components/ui/overlays/ConfirmDialog';
import AppearancePreferencesRoot from '@/components/settings/appearance/AppearancePreferencesRoot';
import AnalyticsConsentRoot from '@/components/analytics/AnalyticsConsentRoot';
// SDK styles first so our globals.css overrides win at equal specificity
// (e.g. the la-crypta `--nui-overlay-bg` override that lets the login
// backdrop animation bleed through the modal overlay).
import '@nostr-wot/ui/styles.css';
import '../globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

/** `/`, `/es`, `/pt`: one tree per language. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

/**
 * Site-wide metadata in the URL's language; each page adds its own canonical.
 * A segment that is not a language (`/dev/...`, `/x.txt`, which skip the
 * proxy) reads as English (src/i18n/request.ts) rather than a throw: the
 * layout still 404s, and this way the 404 keeps a title.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return siteMetadata(await getTranslations({ locale }), locale);
}

/**
 * Readers can zoom every public page; the app shell and the voice room turn
 * zoom off in their own layouts.
 */
export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * The root layout of every page: `<html lang>` is the URL's language
 * (`/es/...` is Spanish), and the client tree gets only the `common`
 * module here; each route adds the modules it renders through its own
 * `IntlScope`. A segment that is not one of our languages is a 404 here,
 * once for every page under it (so `/fr/app` never renders English under a
 * French URL); the pages read the language with next-intl's `getLocale()`.
 */
export default async function LocaleLayout({ children }: { children: ReactNode }) {
  const locale = await segmentLocale();
  if (!isLocale(locale)) notFound();
  const jsonLd = siteJsonLd(await getTranslations({ locale }), locale);

  return (
    <html lang={locale}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
        {/* Native blocking script: redirects an installed PWA before the landing paints.
            No inline next/script wrapper, so the same root can be prerendered. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- Must redirect installed PWAs before first paint, without an inline bootstrap. */}
        <script id="obelisk-pwa-route-guard" src="/pwa-route-guard.js" />
        <Script id="obelisk-pwa-register" strategy="afterInteractive" src="/pwa-register.js" />

      </head>
      <body
        className={`${inter.className} bg-lc-black text-lc-white antialiased`}
        data-nui-root
        data-nui-theme="la-crypta"
      >
        <IntlScope scope="common">
          <AppearancePreferencesRoot />
          {children}
          <ToastStack />
          <ConfirmDialogHost />
          {/* Google Analytics: nothing in this HTML; loaded from the
              browser only after the person allows it (src/services/analytics/). */}
          <AnalyticsConsentRoot />
        </IntlScope>
      </body>
    </html>
  );
}
