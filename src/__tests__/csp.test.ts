import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

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
});
