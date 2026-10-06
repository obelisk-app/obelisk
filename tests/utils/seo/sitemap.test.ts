import { describe, expect, it } from 'vitest';
import { SITEMAP_PAGES, buildSitemap, latestUpdate, type SitemapGuide } from '@/utils/seo/sitemap';
import { buildRobots } from '@/utils/seo/robots';

const guide = (slug: string, updatedAt: string): SitemapGuide => ({ slug, updatedAt, images: [`https://obelisk.ar/og/guides/${slug}.png`] });
const guides = {
  en: [guide('a', '2026-04-16'), guide('b', '2026-09-23')],
  es: [guide('a', '2026-04-17'), guide('b', '2026-08-01')],
  pt: [guide('a', '2026-04-16'), guide('b', '2026-09-23')],
};

describe('buildSitemap', () => {
  const entries = buildSitemap(guides);
  const at = (url: string) => entries.find((e) => e.url === url);

  it('dates each guide by its own front matter, per language', () => {
    expect(at('https://obelisk.ar/guides/b')?.lastModified).toBe('2026-09-23');
    expect(at('https://obelisk.ar/es/guides/b')?.lastModified).toBe('2026-08-01');
  });

  it('dates the guides index by the newest guide in that language', () => {
    expect(at('https://obelisk.ar/guides')?.lastModified).toBe('2026-09-23');
    expect(at('https://obelisk.ar/es/guides')?.lastModified).toBe('2026-08-01');
    expect(latestUpdate([])).toBeUndefined();
  });

  it('gives a page with no content date no lastmod at all, never the build time', () => {
    for (const url of ['https://obelisk.ar', 'https://obelisk.ar/es/features', 'https://obelisk.ar/pt/help']) {
      expect(at(url), url).toBeDefined();
      expect(at(url)?.lastModified, url).toBeUndefined();
    }
  });

  it('lists only indexed pages: every static page and guide in every language, and no /app', () => {
    expect(entries).toHaveLength((SITEMAP_PAGES.length + 2) * 3);
    expect(entries.some((e) => /\/app$/.test(e.url))).toBe(false);
  });

  it('carries the same four alternates on the three versions of a page', () => {
    const langs = ['', '/es', '/pt'].map((p) => at(`https://obelisk.ar${p}/guides/a`)?.alternates?.languages);
    expect(langs[0]).toEqual({ en: 'https://obelisk.ar/guides/a', es: 'https://obelisk.ar/es/guides/a', pt: 'https://obelisk.ar/pt/guides/a', 'x-default': 'https://obelisk.ar/guides/a' });
    expect(langs[1]).toEqual(langs[0]);
    expect(langs[2]).toEqual(langs[0]);
  });
});

describe('buildRobots', () => {
  it('names the sitemap and blocks only the API and the dev harness (noindex pages stay crawlable)', () => {
    expect(buildRobots('https://obelisk.ar')).toEqual({
      rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/dev/'] }],
      sitemap: 'https://obelisk.ar/sitemap.xml',
    });
  });
});
