import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

describe('service worker cache policy', () => {
  it('caches only safe same-origin app shell and static assets', () => {
    expect(sw).toContain("const CACHE_VERSION = 'obelisk-v9-localized-shell-cache'");
    expect(sw).toContain("const STATIC_CACHE = `${CACHE_VERSION}:static`");
    expect(sw).toContain("const SHELL_CACHE = `${CACHE_VERSION}:shell`");
    expect(sw).toContain("const APP_SHELL_KEY = '/app'");
    expect(sw).toContain("url.pathname.startsWith('/_next/static/')");
    expect(sw).toContain("url.pathname === '/manifest.webmanifest'");
    expect(sw).toContain('PUBLIC_ASSET_RE.test(url.pathname)');
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain('isAppShellNavigation(url)');
  });

  it('does not cache auth/session/storage/API routes or non-GET traffic', () => {
    expect(sw).toContain("if (request.method !== 'GET') return true");
    expect(sw).toContain('if (!sameOrigin(url)) return true');
    expect(sw).toContain("if (url.pathname === '/sw.js') return true");
    expect(sw).toContain("if (url.pathname.startsWith('/_next/data/')) return true");
    expect(sw).toContain('const BYPASS_PATH_RE = /(?:^|\\/)(?:api|auth|session|storage)(?:\\/|$)/i');
    expect(sw).not.toMatch(/\blocalStorage\./);
    expect(sw).not.toMatch(/\bindexedDB\./);
  });

  it('uses cache-first assets and network-first navigation fallback', () => {
    expect(sw).toContain('event.waitUntil(fetchAndCache(event.request, cache).catch(() => undefined))');
    expect(sw).toContain('const response = await fetch(event.request)');
    expect(sw).toContain('await putIfCacheable(cache, shellKey, response)');
    expect(sw).toContain('const cached = await cache.match(shellKey) || await caches.match(shellKey)');
  });

  it('keeps one offline shell per language and never caches a redirect', async () => {
    // Evaluate the worker's pure helpers in isolation.
    const helpers = new Function(
      'self',
      `${sw.slice(0, sw.indexOf('async function putIfCacheable'))}; return { isAppShellNavigation, shellKeyFor, isCacheableResponse };`,
    )({ location: { origin: 'https://obelisk.test' }, addEventListener: () => {} });
    const u = (p: string) => new URL(p, 'https://obelisk.test');
    for (const p of ['/', '/app', '/app/x', '/es', '/es/app', '/pt/app?c=1']) {
      expect(helpers.isAppShellNavigation(u(p)), p).toBe(true);
    }
    for (const p of ['/guides', '/es/guides', '/esx/app', '/p/x']) {
      expect(helpers.isAppShellNavigation(u(p)), p).toBe(false);
    }
    expect(helpers.shellKeyFor(u('/app'))).toBe('/app');
    expect(helpers.shellKeyFor(u('/es/app'))).toBe('/es/app');
    expect(helpers.shellKeyFor(u('/pt'))).toBe('/pt/app');
    expect(helpers.isCacheableResponse({ ok: true, redirected: true, type: 'basic' })).toBe(false);
    expect(helpers.isCacheableResponse({ ok: true, redirected: false, type: 'basic' })).toBe(true);
  });
});
