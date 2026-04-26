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
    // script-src must be strict (no unsafe-inline, no unsafe-eval).
    const directives = (csp.value as string).split(';').map((d: string) => d.trim());
    const scriptSrc = directives.find((d: string) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // style-src may include 'unsafe-inline' (required by Tailwind/Next hydration).
    const styleSrc = directives.find((d: string) => d.startsWith('style-src'));
    expect(styleSrc).toBeDefined();
    expect(styleSrc).toContain("'self'");
  });
});
