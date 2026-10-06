import { NextResponse, type NextRequest } from 'next/server';
import { detectLocale, LOCALE_COOKIE, LOCALE_HEADER } from './i18n/index';
import { buildCsp } from './utils/csp';

/**
 * Per-request CSP nonce generator + locale-cookie initializer.
 *
 * Renamed from middleware → proxy per Next 16's deprecation. Two jobs:
 *   1. Mint a fresh nonce on every HTML request and set the
 *      Content-Security-Policy header with `'nonce-<n>'` in script-src.
 *      The page reads the nonce via next/headers and stamps it onto every
 *      inline <Script> we control. Anything else (Cloudflare Rocket
 *      Loader, third-party script tags) gets blocked; the strict CSP
 *      keeps the site safe even if some upstream injects markup.
 *   2. Set/pass a long-lived locale derived from explicit user choice,
 *      Cloudflare/Vercel geo headers, or Accept-Language so every client
 *      route renders with the same language on first paint.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/sw.js') {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Service-Worker-Allowed', '/');
    return response;
  }
  // A UUIDv4 carries 122 random bits; the 32 hex characters left after
  // stripping dashes are base64-encoded into a 44-character nonce token.
  // crypto.randomUUID is available in both the Node and the (deprecated)
  // Edge proxy runtimes.
  const nonce = btoa(crypto.randomUUID().replace(/-/g, ''));

  // The directive list lives in src/utils/csp.ts, shared with the static
  // floor next.config.ts sends on the responses this proxy never sees.
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV !== 'production' });

  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('cloudfront-viewer-country') ||
    request.headers.get('x-country-code') ||
    request.headers.get('x-geo-country') ||
    request.headers.get('x-client-country') ||
    null;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value ?? null;
  const locale = detectLocale({
    cookieLocale,
    countryCode: country,
    acceptLanguage: request.headers.get('accept-language'),
  });

  // Forward the nonce and locale to the rendered page so layout.tsx can read
  // both on the first request, including routes hit before cookies exist.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(LOCALE_HEADER, locale);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  if (!cookieLocale) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  // Skip API + static assets: they don't render HTML and don't need a
  // per-request CSP. Match everything else (pages + dynamic routes).
  matcher: [
    '/sw.js',
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)',
  ],
};
