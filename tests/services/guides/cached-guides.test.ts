import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readdir: vi.fn(), readFile: vi.fn(), list: vi.fn(), read: vi.fn(), cache: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ default: { readdir: mocks.readdir, readFile: mocks.readFile } }));
vi.mock('@/services/guides/guides', () => ({ listAllGuides: mocks.list, readGuideOrNull: mocks.read }));
vi.mock('next/cache', () => ({ unstable_cache: mocks.cache }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('OBELISK_GUIDES_ROOT', '');
  mocks.readdir.mockResolvedValue(['es/example.mdx', 'en/example.mdx']);
  mocks.readFile.mockImplementation(async (file: string) => file.endsWith('es/example.mdx') ? 'Spanish guide' : 'English guide');
  mocks.list.mockImplementation(async (locale: string) => [{ locale }]);
  mocks.read.mockImplementation(async (locale: string, slug: string) => ({ locale, slug }));
  const entries = new Map<string, unknown>();
  mocks.cache.mockImplementation((fn, key, options) => {
    expect(options).toEqual({ revalidate: false });
    return (...args: unknown[]) => {
      const id = JSON.stringify([key, args]);
      if (!entries.has(id)) entries.set(id, fn(...args));
      return entries.get(id);
    };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('persistent guide data', () => {
  it('keeps locale and slug entries separate and reuses article reads for metadata and related cards', async () => {
    const { cachedGuide, cachedGuideList } = await import('@/services/guides/cached-guides');
    expect(await cachedGuide('en', 'example')).toEqual({ locale: 'en', slug: 'example' });
    await cachedGuide('en', 'example');
    await cachedGuide('es', 'example');
    await cachedGuide('es', 'another');
    await cachedGuideList('en');
    await cachedGuideList('en');
    await cachedGuideList('es');
    expect(mocks.read.mock.calls).toEqual([['en', 'example'], ['es', 'example'], ['es', 'another']]);
    expect(mocks.list.mock.calls).toEqual([['en'], ['es']]);
    expect(mocks.readdir).toHaveBeenCalledTimes(1);
    expect(mocks.readFile).toHaveBeenCalledTimes(2);
  });

  it('changes the persistent key when deployed guide content changes', async () => {
    await (await import('@/services/guides/cached-guides')).cachedGuide('en', 'example');
    const originalKey = mocks.cache.mock.calls[0][1];
    vi.resetModules();
    mocks.readFile.mockResolvedValue('Updated content');
    await (await import('@/services/guides/cached-guides')).cachedGuide('en', 'example');
    expect(mocks.cache.mock.calls[1][1]).not.toEqual(originalKey);
  });

  it.each(['development', 'test'])('reads edits directly in %s', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    const { cachedGuide, cachedGuideList } = await import('@/services/guides/cached-guides');
    await cachedGuide('pt', 'example');
    await cachedGuideList('pt');
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.readdir).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledWith('pt', 'example');
    expect(mocks.list).toHaveBeenCalledWith('pt');
  });

  it('bypasses persistent cache for an explicit guide root even in production', async () => {
    vi.stubEnv('OBELISK_GUIDES_ROOT', '/fixture/guides');
    await (await import('@/services/guides/cached-guides')).cachedGuide('en', 'example');
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledWith('en', 'example');
  });
});
