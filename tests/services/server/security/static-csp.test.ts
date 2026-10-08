import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({ build: 'release-1', data: '', reads: 0 }));
vi.mock('node:fs', () => {
  const readFileSync = (path: string) => { files.reads++; return path.endsWith('BUILD_ID') ? files.build : files.data; };
  return { default: { readFileSync }, readFileSync };
});
const token = `'sha256-${'a'.repeat(43)}='`;

beforeEach(() => {
  vi.resetModules();
  files.reads = 0;
  files.build = 'release-1';
  files.data = JSON.stringify({ version: 1, buildId: files.build, routes: { '/en/features': [token], '/es/features': [token] }, fallback: [token] });
});

describe('static document CSP lookup', () => {
  it('resolves default and explicit locale paths and caches the build artifact', async () => {
    const { staticPagePolicy } = await import('@/services/server/security/static-csp');
    expect(staticPagePolicy('/features').hashes).toEqual([token]);
    expect(staticPagePolicy('/%66eatures').hashes).toEqual([token]);
    expect(staticPagePolicy('/es/features').hashes).toEqual([token]);
    expect(staticPagePolicy('/en/features/').hashes).toEqual([token]);
    expect(files.reads).toBe(2);
  });
  it('matches exact built paths, never prefixes or unknown guides', async () => {
    const { staticPagePolicy } = await import('@/services/server/security/static-csp');
    for (const path of ['/features/other', '/app', '/guides/missing', '/esx/features', '/en%2Ffeatures', '/%invalid']) {
      expect(staticPagePolicy(path)).toEqual({ hashes: null, fallback: [token] });
    }
  });
  it('rejects stale builds and malformed hash tokens', async () => {
    const { staticPagePolicy } = await import('@/services/server/security/static-csp');
    files.build = 'release-2';
    expect(() => staticPagePolicy('/features')).toThrow(/stale/);
    files.build = 'release-1';
    files.data = JSON.stringify({ version: 1, buildId: files.build, routes: { '/en/features': ["'unsafe-inline'"] }, fallback: [] });
    expect(() => staticPagePolicy('/features')).toThrow(/Invalid static CSP/);
  });
});
