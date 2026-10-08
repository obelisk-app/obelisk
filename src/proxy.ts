import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, detectLocale, isLocale } from './i18n/index';
import { routing } from './i18n/routing';
import { buildCsp } from './utils/security/csp';
import { isCrawler } from './utils/seo/crawler';
import { staticPagePolicy } from './services/server/security/static-csp';

/**
 * Build hashes for static pages, request nonces for dynamic pages, and URL locales.
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
 *      in step with the URL's language; we forward the CSP so Next can stamp
 *      its dynamic scripts with the nonce, and send the same response policy. The policy itself is in src/utils/security/csp.ts,
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
  const isDev = process.env.NODE_ENV !== 'production';
  let policy: ReturnType<typeof staticPagePolicy> = { hashes: null, fallback: [] };
  if (!isDev) {
    try {
      policy = staticPagePolicy(request.nextUrl.pathname);
    } catch (error) {
      console.error('[CSP] Build policy unavailable', error);
      return new NextResponse('Site build unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Content-Security-Policy': buildCsp({ nonce: null, hashes: [], isDev: false }) },
      });
    }
  }
  // Only dynamic documents need a fresh token. Static documents authorize
  // exactly the inline scripts emitted into their immutable build artifact.
  const nonce = policy.hashes ? null : btoa(crypto.randomUUID().replace(/-/g, ''));
  const csp = buildCsp({ nonce, isDev, hashes: [...new Set([...(policy.hashes ?? []), ...policy.fallback])] });

  // 307, not 308: the target depends on who is asking, so no cache may keep it.
  const redirect = preferredRedirect(request);
  const response = redirect ? NextResponse.redirect(redirect, 307) : withPolicy(intlMiddleware(request), nonce, csp);
  // An unprefixed URL with no cookie was English by default, not by choice:
  // next-intl would still write `locale=en`, which would then outrank the
  // visitor's country and browser language on every later visit.
  if (!redirect && !request.cookies.has(LOCALE_COOKIE) && !PREFIXED.test(request.nextUrl.pathname)) {
    response.headers.delete('set-cookie');
  }
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/** Next reads the nonce from the request CSP, not from the convenience x-nonce header. */
function withPolicy(response: NextResponse, nonce: string | null, csp: string): NextResponse {
  const overrides = response.headers.get('x-middleware-override-headers');
  if (overrides === null) return response;
  const names = new Set([...overrides.split(','), 'x-nonce', 'content-security-policy']);
  response.headers.set('x-middleware-override-headers', [...names].join(','));
  response.headers.set('x-middleware-request-x-nonce', nonce ?? '');
  response.headers.set('x-middleware-request-content-security-policy', csp);
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
