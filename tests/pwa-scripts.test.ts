import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const guard = readFileSync('public/pwa-route-guard.js', 'utf8');
const registration = readFileSync('public/pwa-register.js', 'utf8');

describe('static PWA scripts', () => {
  it.each(['/', '/es', '/pt/'])('redirects installed launches at %s without dropping the query or fragment', (pathname) => {
    const replace = vi.fn();
    runInNewContext(guard, { matchMedia: () => ({ matches: true }), window: { navigator: {} }, location: { pathname, search: '?relay=a', hash: '#join', replace } });
    const locale = pathname.match(/es|pt/)?.[0];
    expect(replace).toHaveBeenCalledWith(`${locale ? `/${locale}` : ''}/app?relay=a#join`);
  });
  it.each(['/features', '/es/guides', '/app'])('keeps installed deep links at %s', (pathname) => {
    const replace = vi.fn();
    runInNewContext(guard, { matchMedia: () => ({ matches: true }), window: { navigator: {} }, location: { pathname, replace } });
    expect(replace).not.toHaveBeenCalled();
  });
  it('leaves browser visits on the landing page', () => {
    const replace = vi.fn();
    runInNewContext(guard, { matchMedia: () => ({ matches: false }), window: { navigator: {} }, location: { pathname: '/', replace } });
    expect(replace).not.toHaveBeenCalled();
  });
  it.each(['loading', 'complete'])('registers once when injected during %s', async (readyState) => {
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ update });
    const addEventListener = vi.fn();
    runInNewContext(registration, { navigator: { serviceWorker: { register, addEventListener: vi.fn() } }, document: { readyState }, window: { addEventListener } });
    if (readyState === 'loading') {
      expect(register).not.toHaveBeenCalled();
      expect(addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
      addEventListener.mock.calls[0][1]();
    }
    await Promise.resolve();
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js', { scope: '/', updateViaCache: 'none' });
    expect(update).toHaveBeenCalledOnce();
  });
  it('reloads only once for a given worker update', () => {
    const addEventListener = vi.fn();
    const reload = vi.fn();
    const values = new Map<string, string>();
    runInNewContext(registration, {
      navigator: { serviceWorker: { addEventListener } }, document: { readyState: 'loading' },
      window: { addEventListener: vi.fn(), location: { reload } },
      localStorage: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) },
    });
    const receive = addEventListener.mock.calls[0][1];
    receive({ data: { type: 'unrelated' } });
    receive({ data: { type: 'OBELISK_SW_UPDATED', version: 'v2' } });
    receive({ data: { type: 'OBELISK_SW_UPDATED', version: 'v2' } });
    expect(reload).toHaveBeenCalledOnce();
  });
});
