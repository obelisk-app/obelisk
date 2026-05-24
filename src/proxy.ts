import { NextResponse, type NextRequest } from 'next/server';
import { detectLocale, LOCALE_COOKIE, LOCALE_HEADER } from './i18n/index';

/**
 * Per-request CSP nonce generator + locale-cookie initializer.
 *
 * Renamed from middleware → proxy per Next 16's deprecation. Two jobs:
 *   1. Mint a fresh nonce on every HTML request and set the
 *      Content-Security-Policy header with `'nonce-<n>'` in script-src.
 *      The page reads the nonce via next/headers and stamps it onto every
 *      inline <Script> we control. Anything else (Cloudflare Rocket
 *      Loader, third-party script tags) gets blocked — the strict CSP
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
  // 16 random bytes → ~22 base64 chars. Edge runtime exposes
  // crypto.randomUUID; we strip dashes and base64-encode for compactness.
  const nonce = btoa(crypto.randomUUID().replace(/-/g, ''));

  // Google Analytics: src/app/layout.tsx loads gtag.js from googletagmanager.
  // Allow that origin in script-src and connect-src (gtag posts beacons too).
  //
  // 'unsafe-eval' is dev-only — React's dev build uses eval() to reconstruct
  // call stacks across module boundaries (production never does). Without
  // it the React tree fails to hydrate over a tunneled origin.
  const isDev = process.env.NODE_ENV !== 'production';
  const evalSrc = isDev ? " 'unsafe-eval'" : '';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval'${evalSrc} 'nonce-${nonce}' https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' wss: https: https://www.google-analytics.com https://www.googletagmanager.com",
    "font-src 'self' data:",
    // Allow common embeddable players (YouTube, Vimeo, Twitch, SoundCloud,
    // Spotify, Twitter/X, TikTok, Instagram, Reddit, Bandcamp, Mixcloud,
    // Loom, CodePen, CodeSandbox, GitHub Gist, Google Maps/Docs).
    [
      'frame-src',
      "'self'",
      'https://www.youtube.com',
      'https://www.youtube-nocookie.com',
      'https://player.vimeo.com',
      'https://player.twitch.tv',
      'https://clips.twitch.tv',
      'https://embed.twitch.tv',
      'https://w.soundcloud.com',
      'https://open.spotify.com',
      'https://platform.twitter.com',
      'https://platform.x.com',
      'https://www.tiktok.com',
      'https://www.instagram.com',
      'https://www.redditmedia.com',
      'https://embed.reddit.com',
      'https://bandcamp.com',
      'https://*.bandcamp.com',
      'https://www.mixcloud.com',
      'https://www.loom.com',
      'https://codepen.io',
      'https://codesandbox.io',
      'https://gist.github.com',
      'https://www.google.com',
      'https://docs.google.com',
    ].join(' '),
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

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
  // Skip API + static assets — they don't render HTML and don't need a
  // per-request CSP. Match everything else (pages + dynamic routes).
  matcher: [
    '/sw.js',
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)',
  ],
};
