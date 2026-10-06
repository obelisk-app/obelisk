import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALES, isLocale } from '@/i18n';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { PWA_ROUTE_GUARD, siteJsonLd, siteMetadata } from '@/utils/seo/site';
import ToastStack from '@/components/feedback/ToastStack';
import { ConfirmDialogHost } from '@/components/ui/ConfirmDialog';
import AppearancePreferencesRoot from '@/components/settings/AppearancePreferencesRoot';
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
 * proxy) gets English here rather than a throw: the page itself still 404s,
 * and this way the 404 keeps a title.
 */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale: segment } = await params;
  const locale = isLocale(segment) ? segment : DEFAULT_LOCALE;
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
 * `IntlScope`.
 */
export default async function LocaleLayout({ children, params }: LocaleParams & { children: ReactNode }) {
  const locale = await pageLocale(params);
  // Per-request CSP nonce minted by src/proxy.ts. Stamping it on every
  // inline <Script>/<script> we render keeps the strict CSP green; any
  // injected upstream script (Cloudflare, browser extensions) without
  // this nonce is correctly blocked.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const jsonLd = siteJsonLd(await getTranslations({ locale }), locale);

  return (
    <html lang={locale}>
      <head>
        <script
          type="application/ld+json"
          nonce={nonce}
          // React 19 strips the nonce attribute from DOM nodes after CSP
          // evaluation (security: prevents JS from reading the nonce). The
          // SSR HTML keeps it (browser uses it during initial parse) but
          // hydration sees nonce="" on the live element. This is intended;
          // suppress the otherwise-confusing warning.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
        {/* PWA route guard (see PWA_ROUTE_GUARD): an installed app opened
            on the landing page jumps to the chat shell in the same
            language. Rendered as a
            native <script> in <head> (not next/script) so it runs as the
            HTML is parsed (earlier than `beforeInteractive`) and
            sidesteps React 19's nonce-stripping hydration warning, same
            pattern as the JSON-LD block above. */}
        <script
          id="obelisk-pwa-route-guard"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: PWA_ROUTE_GUARD }}
        />
        {/* Register the minimal service worker so Chrome / Edge / Brave
            offer the "Install app" prompt. The worker itself is
            pass-through (see /public/sw.js); registering it is the
            installability gate, not a behavior change. */}
        <Script id="obelisk-pwa-register" strategy="afterInteractive" nonce={nonce}>
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.addEventListener('message', function (event) {
                if (!event.data || event.data.type !== 'OBELISK_SW_UPDATED') return;
                var key = 'obelisk-sw-version';
                var nextVersion = String(event.data.version || '');
                try {
                  if (nextVersion && localStorage.getItem(key) === nextVersion) return;
                  if (nextVersion) localStorage.setItem(key, nextVersion);
                } catch (e) {}
                window.location.reload();
              });
              window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(function (registration) {
                  registration.update().catch(function () {});
                }).catch(function () {
                  /* swallow: installability is a UX bonus, not a hard requirement */
                });
              });
            }
          `}
        </Script>
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
