/**
 * Check 9: the sitemap is valid XML, lists exactly the pages that must be
 * indexed (each language once), with reciprocal alternates, images that
 * answer, and a `lastmod` that is a real date from the content (guides'
 * front matter) or absent, never the time of the build.
 */

import { JSDOM } from 'jsdom';
import { LOCALES, SITE, abs, expectedLastmod, indexablePaths, splitLocale, HREFLANG } from './expect';
import { get, mapLimit, sitePath } from './http';
import { CHECKS as C, type Report } from './report';

export type SitemapEntry = { loc: string; alternates: Record<string, string>; lastmod: string | null; images: string[] };

export async function readSitemap(base: string, report: Report): Promise<Map<string, SitemapEntry>> {
  const url = `${SITE}/sitemap.xml`;
  const res = await get(base, '/sitemap.xml');
  const out = new Map<string, SitemapEntry>();
  if (!report.expect(res.status === 200, url, C.sitemap, `sitemap answers ${res.status}`)) return out;
  report.expect(/xml/.test(res.contentType), url, C.sitemap, `content-type ${res.contentType}`);
  const doc = new JSDOM(res.text(), { contentType: 'text/xml' }).window.document;
  if (!report.expect(!doc.querySelector('parsererror'), url, C.sitemap, 'sitemap is not well-formed XML')) return out;
  report.expect(doc.documentElement.namespaceURI === 'http://www.sitemaps.org/schemas/sitemap/0.9', url, C.sitemap, 'wrong urlset namespace');
  for (const u of Array.from(doc.getElementsByTagName('url'))) {
    const loc = u.getElementsByTagName('loc')[0]?.textContent?.trim() ?? '';
    const alternates: Record<string, string> = {};
    for (const l of Array.from(u.getElementsByTagName('xhtml:link'))) alternates[l.getAttribute('hreflang') ?? ''] = l.getAttribute('href') ?? '';
    const images = Array.from(u.getElementsByTagName('image:loc')).map((n) => n.textContent?.trim() ?? '');
    report.expect(!out.has(loc), loc, C.sitemap, 'listed twice');
    out.set(loc, { loc, alternates, lastmod: u.getElementsByTagName('lastmod')[0]?.textContent?.trim() ?? null, images });
  }
  return out;
}

export async function checkSitemap(base: string, entries: Map<string, SitemapEntry>, report: Report): Promise<void> {
  const expected = new Set(indexablePaths().flatMap((p) => LOCALES.map((l) => abs(l, p))));
  for (const want of expected) report.expect(entries.has(want), want, C.sitemap, 'indexable page missing from the sitemap');
  const images = new Set<string>();
  for (const e of entries.values()) {
    report.expect(expected.has(e.loc), e.loc, C.sitemap, 'listed in the sitemap but not an indexable page');
    report.expect(e.loc.startsWith(SITE) && !/\/$|\?|#/.test(e.loc), e.loc, C.sitemap, 'loc is not a canonical absolute URL');
    const { locale, path } = splitLocale(sitePath(e.loc, SITE));
    const wantAlt: Record<string, string> = { 'x-default': abs('en', path) };
    for (const l of LOCALES) wantAlt[HREFLANG[l]] = abs(l, path);
    report.expect(JSON.stringify(sorted(e.alternates)) === JSON.stringify(sorted(wantAlt)), e.loc, C.sitemap, `alternates ${JSON.stringify(e.alternates)}`);
    for (const href of Object.values(e.alternates)) {
      const other = entries.get(href);
      report.expect(!other || JSON.stringify(sorted(other.alternates)) === JSON.stringify(sorted(e.alternates)), e.loc, C.sitemap, `alternates not reciprocal with ${href}`);
    }
    const wantMod = expectedLastmod(locale, path);
    if (wantMod) report.expect(Boolean(e.lastmod?.startsWith(wantMod)), e.loc, C.sitemap, `lastmod ${e.lastmod}, expected ${wantMod} from the content`);
    else report.expect(e.lastmod === null, e.loc, C.sitemap, `lastmod ${e.lastmod} on a page with no content date (build time is not a modification date)`);
    for (const img of e.images) images.add(img);
  }
  await mapLimit([...images], 6, async (img) => {
    const res = await get(base, sitePath(img, SITE));
    report.expect(img.startsWith(SITE) && res.status === 200 && res.contentType.startsWith('image/'), img, C.sitemap, `sitemap image answers ${res.status} ${res.contentType}`);
  });
}

function sorted(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}
