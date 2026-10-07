import { describe, it, expect, beforeAll } from 'vitest';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { snapshotPaths } from '@/utils/guides/asset-meta';
import { readGuide } from '@/services/guides/guides';

let entries: Awaited<ReturnType<typeof sitemap>>;

const SITE = 'https://obelisk.ar';
const isArticle = (url: string) => /\/guides\/[^/]+$/.test(url);

beforeAll(async () => {
  entries = await sitemap();
});

describe('sitemap: every indexed page in every language', () => {
  it('lists each indexed page three times: English unprefixed, /es and /pt', () => {
    for (const path of ['', '/mobile', '/desktop', '/features', '/help', '/help/local-data', '/media-kit', '/guides']) {
      for (const url of [`${SITE}${path}`, `${SITE}/es${path}`, `${SITE}/pt${path}`]) {
        expect(entries.some((e) => e.url === url), url).toBe(true);
      }
    }
  });

  it('lists no page that is kept out of search', () => {
    for (const e of entries) expect(e.url, e.url).not.toMatch(/\/(app|voice|notes|p|t|r)(\/|$)/);
  });

  it('gives every entry en, es, pt and x-default alternates, itself among them', () => {
    for (const e of entries) {
      const langs = e.alternates?.languages as Record<string, string> | undefined;
      expect(Object.keys(langs ?? {}).sort(), e.url).toEqual(['en', 'es', 'pt', 'x-default']);
      expect(Object.values(langs ?? {})).toContain(e.url);
    }
  });

  it('dates a guide by its front matter, never by the build', async () => {
    for (const [prefix, locale] of [['', 'en'], ['/es', 'es'], ['/pt', 'pt']] as const) {
      const entry = entries.find((e) => e.url === `${SITE}${prefix}/guides/vesta`);
      const { frontmatter } = await readGuide(locale, 'vesta');
      expect(entry?.lastModified).toBe(frontmatter.updatedAt);
    }
    // A page with no content date carries none, rather than today's.
    for (const path of ['', '/features', '/media-kit']) {
      const entry = entries.find((e) => e.url === `${SITE}${path}`);
      expect(entry?.lastModified, path).toBeUndefined();
    }
    expect(entries.every((e) => !(e.lastModified instanceof Date))).toBe(true);
  });

  it('dates the guides index by its newest guide', () => {
    const index = entries.find((e) => e.url === `${SITE}/guides`);
    const newest = entries.filter((e) => isArticle(e.url) && !/\/(es|pt)\//.test(e.url)).map((e) => String(e.lastModified)).sort().pop();
    expect(index?.lastModified).toBe(newest);
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

  it('lists each language\'s own snapshots: es and pt guides never point at the English images', () => {
    for (const locale of ['es', 'pt'] as const) {
      const entry = entries.find((e) => e.url === `${SITE}/${locale}/guides/swap-anything`);
      const imgs = entry?.images ?? [];
      expect(imgs.length).toBeGreaterThan(0);
      expect(imgs).toContain(`${SITE}${snapshotPaths('swap-anything', locale).png}`);
      for (const url of imgs) expect(url, url).toContain(`/og/guides/${locale}/`);
    }
  });
});

describe('robots.txt', () => {
  it('points at the sitemap and keeps crawlers out of the API and the dev harness only', () => {
    const r = robots();
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`);
    expect(r.rules).toEqual([{ userAgent: '*', allow: '/', disallow: ['/api/', '/dev/'] }]);
    expect('host' in r).toBe(false);
  });
});
