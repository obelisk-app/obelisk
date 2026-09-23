import { describe, it, expect, beforeAll } from 'vitest';
import sitemap from './sitemap';
import { snapshotPaths } from '@/components/guides/svg/asset-meta';
import { LOCALES } from '@/i18n';
import { guidesHref } from '@/lib/guide-urls';

let entries: Awaited<ReturnType<typeof sitemap>>;

/**
 * Index URLs derived from the locale list rather than spelled out: with
 * `/guides/es` hardcoded, a third language's index was classified as an
 * article and failed the "every article has an image" check.
 */
const INDEX_URLS = new Set(LOCALES.map((locale) => guidesHref(locale)));

function isArticleEntry(url: string) {
  if (!url.includes('/guides/')) return false;
  return ![...INDEX_URLS].some((index) => url.endsWith(index));
}

beforeAll(async () => {
  entries = await sitemap();
});

describe('sitemap.images (Google image-sitemap extension)', () => {
  it('includes canonical public pages and excludes redirects', () => {
    expect(entries.some((e) => e.url.endsWith('/app'))).toBe(true);
    expect(entries.some((e) => e.url.endsWith('/features'))).toBe(true);
    expect(entries.some((e) => e.url.endsWith('/help'))).toBe(true);
    expect(entries.some((e) => e.url.endsWith('/chat'))).toBe(false);
    expect(entries.some((e) => e.url.includes('/guides/en/'))).toBe(false);
  });

  it('every guide article entry declares at least one image', () => {
    const articleEntries = entries.filter((e) => isArticleEntry(e.url));
    expect(articleEntries.length).toBeGreaterThan(0);
    for (const e of articleEntries) {
      expect(e.images).toBeDefined();
      expect(Array.isArray(e.images)).toBe(true);
      expect((e.images ?? []).length).toBeGreaterThan(0);
    }
  });

  it('the swap-anything guide declares both its hero and inline diagram', () => {
    const en = entries.find((e) => e.url.endsWith('/guides/swap-anything'));
    expect(en).toBeDefined();
    const imgs = en!.images ?? [];
    expect(imgs.some((u) => u.endsWith(snapshotPaths('swap-anything').png))).toBe(true);
    expect(imgs.some((u) => u.endsWith(snapshotPaths('swap-matrix').png))).toBe(true);
  });

  it('image URLs are absolute (start with the site origin)', () => {
    const articleEntries = entries.filter((e) => isArticleEntry(e.url));
    for (const e of articleEntries) {
      for (const url of e.images ?? []) {
        expect(url.startsWith('http')).toBe(true);
      }
    }
  });
});
