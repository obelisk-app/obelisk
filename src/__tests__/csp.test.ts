// src/__tests__/csp.test.ts
import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

describe('CSP', () => {
  it('exports a security headers entry that includes Content-Security-Policy', async () => {
    const headersFn = (nextConfig as any).headers;
    expect(typeof headersFn).toBe('function');
    const headers = await headersFn();
    const all = headers.flatMap((h: any) => h.headers);
    const csp = all.find((h: any) => h.key === 'Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp.value).toContain("script-src 'self'");
    expect(csp.value).not.toContain("'unsafe-inline'");
  });
});
