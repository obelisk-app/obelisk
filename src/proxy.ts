import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, detectLocale, isLocale } from './i18n/index';
import { routing } from './i18n/routing';
import { buildCsp } from './utils/security/csp';
import { isCrawler } from './utils/seo/crawler';

/**
 * Per-request CSP nonce, first-visit language, and URL locales.
 *
 * Renamed from middleware to proxy per Next 16's deprecation. Three jobs,
 * in this order:
 *
 *   1. `/sw.js` passes through with no-cache headers.
 *   2. An unprefixed URL (`/`, `/app`, `/guides/x`) is English, unless the
 *      visitor's language says otherwise: the `locale` cookie (a language
 *      they picked) always wins; without a cookie, the CDN's country and
 *      then Accept-Language may redirect to `/es/...` or `/pt/...`. With no
 *      signal at all the page stays English at `/`. A crawler or a
 *      link-preview bot is never redirected (it must read the URL it asked
 *      for), and a prefixed URL never is either: the URL is the language.
 *   3. next-intl maps the URL to the `[locale]` route and keeps the cookie
 *      in step with the URL's language; we add the nonce to the request
 *      headers it forwards, so `headers()` in the layout reads it, and set
 *      the CSP on whatever it returns. The policy itself is in src/utils/security/csp.ts,
 *      shared with the static floor next.config.ts sends.
 */

const intlMiddleware = createMiddleware(routing);

/** The geo headers the CDNs we run behind set, first match wins. */
const COUNTRY_HEADERS = [
  'x-vercel-ip-country', 'cf-ipcountry', 'cloudfront-viewer-country',
  'x-country-code', 'x-geo-country', 'x-client-country',
];

const PREFIXED = new RegExp(`^/(${LOCALES.join('|')})(?:/|$)`);

/** Where an unprefixed URL should go for this visitor, or null to stay. */
function preferredRedirect(request: NextRequest): URL | null {
  const { pathname, search } = request.nextUrl;
  if (PREFIXED.test(pathname)) return null;
  // Crawlers and link-preview bots get the URL they asked for (see isCrawler).
  if (isCrawler(request.headers.get('user-agent'))) return null;
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value ?? null;
  const country = COUNTRY_HEADERS.map((h) => request.headers.get(h)).find(Boolean) ?? null;
  const locale = isLocale(cookie)
    ? cookie
    : detectLocale({ countryCode: country, acceptLanguage: request.headers.get('accept-language') });
  if (locale === DEFAULT_LOCALE) return null;
  // Built on `request.url`, the origin Next resolves redirects against, so
  // the Location it sends is relative; `nextUrl` can carry the server's
  // internal `localhost` host, which would leak into the header.
  return new URL(`${pathname === '/' ? `/${locale}` : `/${locale}${pathname}`}${search}`, request.url);
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/sw.js') {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Service-Worker-Allowed', '/');
    return response;
  }
  // A UUIDv4 carries 122 random bits; the 32 hex characters left after
  // stripping dashes are base64-encoded into a 44-character nonce token.
  const nonce = btoa(crypto.randomUUID().replace(/-/g, ''));
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV !== 'production' });

  // 307, not 308: the target depends on who is asking, so no cache may keep it.
  const redirect = preferredRedirect(request);
  const response = redirect ? NextResponse.redirect(redirect, 307) : withNonce(intlMiddleware(request), nonce);
  // An unprefixed URL with no cookie was English by default, not by choice:
  // next-intl would still write `locale=en`, which would then outrank the
  // visitor's country and browser language on every later visit.
  if (!redirect && !request.cookies.has(LOCALE_COOKIE) && !PREFIXED.test(request.nextUrl.pathname)) {
    response.headers.delete('set-cookie');
  }
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/**
 * Hand the nonce to the page as a request header. next-intl answers a page
 * request with `NextResponse.next`/`rewrite` carrying the full request
 * header list (`x-middleware-override-headers`); adding `x-nonce` to that
 * list is how `headers()` in the layout sees it. (Re-creating the request
 * with the header instead made next-intl's rewrite URL use the server's
 * internal host, which Next then treated as an external proxy.)
 */
function withNonce(response: NextResponse, nonce: string): NextResponse {
  const overrides = response.headers.get('x-middleware-override-headers');
  if (overrides === null) return response;
  response.headers.set('x-middleware-override-headers', `${overrides},x-nonce`);
  response.headers.set('x-middleware-request-x-nonce', nonce);
  return response;
}

export const config = {
  // Skip API, the dev harness and static assets: they don't render
  // localized HTML and don't need a per-request CSP. Match everything else.
  matcher: [
    '/sw.js',
    '/((?!api|dev|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)',
  ],
};
