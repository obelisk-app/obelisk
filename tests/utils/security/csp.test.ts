import { describe, it, expect } from 'vitest';
import { buildCsp, cspDirectives } from '@/utils/security/csp';

const NONCE = 'MDAwMDAwMDAwMDAwNDAwMDgwMDAwMDAwMDAwMDAwMDA=';

/** `directive-name` -> set of source tokens, for set comparisons. */
function parse(policy: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const raw of policy.split(';')) {
    const [name, ...sources] = raw.trim().split(/\s+/);
    if (name) out.set(name, new Set(sources));
  }
  return out;
}

describe('the static CSP floor is a superset of the nonce policy', () => {
  // Two CSP headers on one response are enforced as their intersection. For
  // the floor to be harmless alongside the proxy policy, every token the
  // proxy policy allows must be allowed by the floor too. If this test
  // fails, the floor would veto something the proxy permits and break the
  // page wherever both headers reach a browser.
  for (const isDev of [false, true]) {
    it(`isDev=${isDev}: every directive of the nonce policy is contained in the floor`, () => {
      const strict = parse(buildCsp({ nonce: NONCE, isDev }));
      const floor = parse(buildCsp({ nonce: null, isDev }));

      expect([...floor.keys()]).toEqual([...strict.keys()]);
      for (const [name, strictSources] of strict) {
        const floorSources = floor.get(name)!;
        for (const token of strictSources) {
          if (token === `'nonce-${NONCE}'`) {
            // The one token the floor cannot carry; 'unsafe-inline' is the
            // only source expression that is a superset of any nonce.
            expect(floorSources.has("'unsafe-inline'")).toBe(true);
            continue;
          }
          expect(floorSources.has(token)).toBe(true);
        }
      }
    });
  }

  it('the floor differs from the nonce policy in exactly one token', () => {
    const strict = cspDirectives({ nonce: NONCE, isDev: false });
    const floor = cspDirectives({ nonce: null, isDev: false });
    const diffs = strict.filter((d, i) => d !== floor[i]);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatch(/^script-src /);
    expect(floor.find((d) => d.startsWith('script-src'))).toBe(
      strict.find((d) => d.startsWith('script-src'))!.replace(`'nonce-${NONCE}'`, "'unsafe-inline'"),
    );
  });

  it('the floor carries no nonce and the nonce policy no unsafe-inline for scripts', () => {
    const floor = buildCsp({ nonce: null, isDev: false });
    const strict = buildCsp({ nonce: NONCE, isDev: false });
    expect(floor).not.toMatch(/'nonce-/);
    const strictScript = cspDirectives({ nonce: NONCE, isDev: false }).find((d) => d.startsWith('script-src'))!;
    expect(strictScript).not.toContain("'unsafe-inline'");
    expect(strict).toContain(`'nonce-${NONCE}'`);
  });

  it('keeps unsafe-eval out of production in both forms', () => {
    expect(buildCsp({ nonce: NONCE, isDev: false })).not.toContain("'unsafe-eval'");
    expect(buildCsp({ nonce: null, isDev: false })).not.toContain("'unsafe-eval'");
    expect(buildCsp({ nonce: NONCE, isDev: true })).toContain("'unsafe-eval'");
    expect(buildCsp({ nonce: null, isDev: true })).toContain("'unsafe-eval'");
  });

  it('upgrades insecure requests only outside local development', () => {
    expect(buildCsp({ nonce: NONCE, isDev: true })).not.toContain('upgrade-insecure-requests');
    expect(buildCsp({ nonce: null, isDev: false })).toContain('upgrade-insecure-requests');
  });

  it('the floor still forbids the things a bypassed request must not be allowed', () => {
    const floor = parse(buildCsp({ nonce: null, isDev: false }));
    expect(floor.get('object-src')).toEqual(new Set(["'none'"]));
    expect(floor.get('frame-ancestors')).toEqual(new Set(["'none'"]));
    expect(floor.get('base-uri')).toEqual(new Set(["'self'"]));
    expect(floor.get('form-action')).toEqual(new Set(["'self'"]));
    expect(floor.has('upgrade-insecure-requests')).toBe(true);
    // Script hosts stay pinned: no wildcard, no https: scheme source.
    const scriptSrc = floor.get('script-src')!;
    expect(scriptSrc.has('https:')).toBe(false);
    expect(scriptSrc.has('*')).toBe(false);
  });

  it('allows exactly what Google Analytics needs once allowed: one script host, beacons over https', () => {
    const strict = parse(buildCsp({ nonce: NONCE, isDev: false }));
    const scriptHosts = [...strict.get('script-src')!].filter((v) => v.startsWith('https://'));
    expect(scriptHosts).toEqual(['https://www.googletagmanager.com']);
    // gtag.js beacons to region*.google-analytics.com (fetch / sendBeacon) and
    // may fall back to an image: both covered by the scheme source.
    expect(strict.get('connect-src')!.has('https:')).toBe(true);
    expect(strict.get('img-src')!.has('https:')).toBe(true);
  });
});
