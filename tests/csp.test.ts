import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { LOCALE_COOKIE } from '@/i18n';
import { buildCsp } from '@/utils/security/csp';
import nextConfig from '../next.config';

describe('CSP', () => {
  beforeEach(() => {
    // crypto.randomUUID is required by the nonce generator; jsdom provides it,
    // but explicit mock keeps the assertion deterministic.
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000' as `${string}-${string}-${string}-${string}-${string}`);
  });

  it('proxy attaches a Content-Security-Policy header with a per-request nonce', () => {
    const req = new NextRequest('https://obelisk.test/');
    const res = proxy(req);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();

    const directives = csp!.split(';').map((d) => d.trim());
    const scriptSrc = directives.find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    // unsafe-eval is dev-only (React DevTools); production has it stripped.
    if (process.env.NODE_ENV === 'production') {
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    }
    // unsafe-inline is never allowed for scripts.
    expect(scriptSrc).not.toContain("'unsafe-inline'");

    const styleSrc = directives.find((d) => d.startsWith('style-src'));
    expect(styleSrc).toBeDefined();
    expect(styleSrc).toContain("'self'");
  });

  it('the proxy policy is the shared builder with the minted nonce, so it cannot drift from the floor', () => {
    const res = proxy(new NextRequest('https://obelisk.test/app'));
    const csp = res.headers.get('Content-Security-Policy')!;
    const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)![1];
    expect(csp).toBe(buildCsp({ nonce, isDev: process.env.NODE_ENV !== 'production' }));
    // The nonce the page reads (layout.tsx, serverLocale) is the one in the header.
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  it('next.config.ts sends the static floor on every path for the requests the proxy never sees', async () => {
    const rules = await nextConfig.headers!();
    const everyPath = rules.find((r) => r.source === '/:path*')!;
    const floor = everyPath.headers.find((h) => h.key === 'Content-Security-Policy');
    expect(floor?.value).toBe(buildCsp({ nonce: null, isDev: process.env.NODE_ENV !== 'production' }));
    // Only one rule carries a CSP: two sources matching the same path would
    // put two static policies on a response, and the intersection trap the
    // floor is designed around would then apply between them.
    const cspRules = rules.filter((r) => r.headers.some((h) => h.key.toLowerCase() === 'content-security-policy'));
    expect(cspRules).toHaveLength(1);
  });
});

describe('locale proxy', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000' as `${string}-${string}-${string}-${string}-${string}`);
  });

  const location = (res: Response) => res.headers.get('location');

  it('serves English at / to a request with no language signal (a crawler), and sets no cookie', () => {
    const res = proxy(new NextRequest('https://obelisk.test/'));
    expect(location(res)).toBeNull();
    // next-intl rewrites to the `[locale]` route internally.
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://obelisk.test/en');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('sends a first-time Spanish browser from / to /es', () => {
    const res = proxy(new NextRequest('https://obelisk.test/', { headers: { 'accept-language': 'es-AR,es;q=0.9' } }));
    expect(res.status).toBe(307);
    expect(location(res)).toBe('https://obelisk.test/es');
    expect(res.headers.get('Content-Security-Policy')).toContain("'nonce-");
  });

  it('uses the CDN country before Accept-Language, and keeps the path and query', () => {
    const res = proxy(new NextRequest('https://obelisk.test/app?relay=x', {
      headers: { 'x-vercel-ip-country': 'BR', 'accept-language': 'en-US' },
    }));
    expect(location(res)).toBe('https://obelisk.test/pt/app?relay=x');
  });

  it('a language the user picked wins: locale=en with a Spanish browser stays on /', () => {
    const res = proxy(new NextRequest('https://obelisk.test/', {
      headers: { cookie: `${LOCALE_COOKIE}=en`, 'accept-language': 'es-AR', 'x-vercel-ip-country': 'AR' },
    }));
    expect(location(res)).toBeNull();
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://obelisk.test/en');
  });

  it.each([
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'Twitterbot/1.0',
    'WhatsApp/2.23.20.0',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ])('never language-redirects a crawler or link-preview bot: %s', (ua) => {
    const res = proxy(new NextRequest('https://obelisk.test/guides/vesta', {
      headers: { 'user-agent': ua, 'accept-language': 'es', 'x-vercel-ip-country': 'BR' },
    }));
    expect(location(res)).toBeNull();
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://obelisk.test/en/guides/vesta');
  });

  it('the cookie also moves an unprefixed URL to the picked language', () => {
    const res = proxy(new NextRequest('https://obelisk.test/app', { headers: { cookie: `${LOCALE_COOKIE}=pt` } }));
    expect(location(res)).toBe('https://obelisk.test/pt/app');
  });

  it('never redirects a prefixed URL: the URL is the language, and the cookie follows it', () => {
    const res = proxy(new NextRequest('https://obelisk.test/pt/guides/vesta', {
      headers: { cookie: `${LOCALE_COOKIE}=en`, 'accept-language': 'es' },
    }));
    expect(location(res)).toBeNull();
    expect(res.cookies.get(LOCALE_COOKIE)?.value).toBe('pt');
  });

  it('normalises /en/... to the unprefixed English URL', () => {
    const res = proxy(new NextRequest('https://obelisk.test/en/app'));
    expect(location(res)).toBe('https://obelisk.test/app');
  });

  it('forwards the nonce to the page through next-intl', () => {
    const res = proxy(new NextRequest('https://obelisk.test/es/app'));
    const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(res.headers.get('Content-Security-Policy')!)![1];
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  it('leaves /sw.js alone', () => {
    const res = proxy(new NextRequest('https://obelisk.test/sw.js', { headers: { 'accept-language': 'es' } }));
    expect(location(res)).toBeNull();
    expect(res.headers.get('Service-Worker-Allowed')).toBe('/');
  });
});
