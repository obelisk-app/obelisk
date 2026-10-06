import { describe, it, expect, beforeAll } from 'vitest';
import sitemap from '@/app/sitemap';
import { snapshotPaths } from '@/utils/guides/asset-meta';

let entries: Awaited<ReturnType<typeof sitemap>>;

const SITE = 'https://obelisk.ar';
const isArticle = (url: string) => /\/guides\/[^/]+$/.test(url);

beforeAll(async () => {
  entries = await sitemap();
});

describe('sitemap: every page in every language', () => {
  it('lists each public page three times: English unprefixed, /es and /pt', () => {
    for (const path of ['', '/app', '/mobile', '/desktop', '/features', '/help', '/media-kit', '/guides']) {
      for (const url of [`${SITE}${path}`, `${SITE}/es${path}`, `${SITE}/pt${path}`]) {
        expect(entries.some((e) => e.url === url), url).toBe(true);
      }
    }
  });

  it('gives every entry en-US, es-AR, pt-BR and x-default alternates', () => {
    for (const e of entries) {
      const langs = e.alternates?.languages as Record<string, string> | undefined;
      expect(Object.keys(langs ?? {}).sort(), e.url).toEqual(['en-US', 'es-AR', 'pt-BR', 'x-default']);
      expect(Object.values(langs ?? {})).toContain(e.url);
    }
  });

  it('has the same guide slugs in every language', () => {
    const slugs = (prefix: string) => entries
      .map((e) => e.url)
      .filter((u) => u.startsWith(`${SITE}${prefix}/guides/`))
      .map((u) => u.split('/').pop())
      .sort();
    expect(slugs('').length).toBeGreaterThan(10);
    expect(slugs('/es')).toEqual(slugs(''));
    expect(slugs('/pt')).toEqual(slugs(''));
  });

  it('lists no redirect: no /chat, no old /guides/<locale>/ URL', () => {
    expect(entries.some((e) => e.url.endsWith('/chat'))).toBe(false);
    expect(entries.some((e) => /\/guides\/(en|es|pt)(\/|$)/.test(e.url))).toBe(false);
  });

  it('every guide article entry declares at least one absolute image', () => {
    const articles = entries.filter((e) => isArticle(e.url));
    expect(articles.length).toBeGreaterThan(30);
    for (const e of articles) {
      expect((e.images ?? []).length, e.url).toBeGreaterThan(0);
      for (const url of e.images ?? []) expect(url.startsWith('http')).toBe(true);
    }
  });

  it('the swap-anything guide declares both its hero and inline diagram', () => {
    const en = entries.find((e) => e.url === `${SITE}/guides/swap-anything`);
    const imgs = en?.images ?? [];
    expect(imgs.some((u) => u.endsWith(snapshotPaths('swap-anything').png))).toBe(true);
    expect(imgs.some((u) => u.endsWith(snapshotPaths('swap-matrix').png))).toBe(true);
  });
});
