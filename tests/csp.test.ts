import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { LOCALE_COOKIE, LOCALE_HEADER } from '@/i18n';
import { buildCsp } from '@/utils/csp';
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

  it('sets a locale cookie and request header on direct app routes', () => {
    const req = new NextRequest('https://obelisk.test/app', {
      headers: { 'x-vercel-ip-country': 'AR' },
    });
    const res = proxy(req);

    expect(res.cookies.get(LOCALE_COOKIE)?.value).toBe('es');
    expect(res.headers.get('x-middleware-request-' + LOCALE_HEADER)).toBe('es');
  });

  it('uses Accept-Language when geo headers are unavailable', () => {
    const req = new NextRequest('https://obelisk.test/guides', {
      headers: { 'accept-language': 'en-US,en;q=0.8,es;q=0.7' },
    });
    const res = proxy(req);

    expect(res.cookies.get(LOCALE_COOKIE)?.value).toBe('en');
    expect(res.headers.get('x-middleware-request-' + LOCALE_HEADER)).toBe('en');
  });

  it('preserves an explicit user locale cookie', () => {
    const req = new NextRequest('https://obelisk.test/app', {
      headers: {
        cookie: `${LOCALE_COOKIE}=en`,
        'x-vercel-ip-country': 'AR',
      },
    });
    const res = proxy(req);

    expect(res.cookies.get(LOCALE_COOKIE)).toBeUndefined();
    expect(res.headers.get('x-middleware-request-' + LOCALE_HEADER)).toBe('en');
  });
});
