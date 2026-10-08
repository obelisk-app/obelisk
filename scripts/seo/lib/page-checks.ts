/**
 * Checks 2 to 8 and 10 for one page that must be indexed: language, title
 * and description, canonical, hreflang, the link-preview card, JSON-LD,
 * robots, and the head's manifest, icons and viewport.
 */

import { HREFLANG, LOCALES, abs, type Locale } from './expect';
import { first, isNoindex, type PageHead } from './head';
import { get } from './http';
import { placeholderIn, wrongLanguage } from './language';
import { CHECKS as C, type Report } from './report';
import { checkJsonLd } from './jsonld-checks';
import { checkSocial, type ImageHashes } from './social-checks';

export type Page = { url: string; locale: Locale; path: string; head: PageHead };
export type Ctx = { base: string; report: Report; images: ImageHashes };

/** The owner's windows, counted on the rendered strings (" · Obelisk" included). */
export const TITLE_RANGE = [45, 57] as const;
export const DESCRIPTION_RANGE = [145, 157] as const;

/** Reader-facing strings in the head: no placeholder, and in the page's language. */
export function checkCopy(page: Page, ctx: Ctx, userContent = false): void {
  const { head, url, locale } = page;
  const texts: Array<[string, string | undefined]> = [
    ['title', head.titles[0]], ['description', head.descriptions[0]],
    ...['og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt'].map((k) => [k, first(head, k)] as [string, string | undefined]),
  ];
  for (const [key, text] of texts) {
    if (!text) continue;
    const ph = placeholderIn(text);
    ctx.report.expect(!ph, url, C.text, `${key} carries a placeholder or raw key "${ph}": ${text}`);
    // A note or a bio is in whatever language its author wrote it.
    if (userContent) continue;
    const wrong = wrongLanguage(text, locale);
    ctx.report.expect(!wrong, url, C.text, `${key} reads as ${wrong}, page is ${locale}: ${text}`);
  }
}

/**
 * Title 45-57 and description 145-157 characters, for the `<title>` and
 * meta description and for the card's title and description (Open Graph
 * and Twitter), which must be present. `withCard` false checks the first
 * two only (a 404 has no card of its own).
 */
export function checkLengths(page: Page, ctx: Ctx, withCard = true): void {
  const { head, url } = page;
  const r = ctx.report;
  r.expect(head.titles.length === 1, url, C.text, `${head.titles.length} <title> elements in <head>`);
  r.expect(head.descriptions.length === 1, url, C.text, `${head.descriptions.length} meta descriptions`);
  const titles: Array<[string, string | undefined]> = [['title', head.titles[0]]];
  const descriptions: Array<[string, string | undefined]> = [['description', head.descriptions[0]]];
  if (withCard) {
    titles.push(['og:title', first(head, 'og:title')], ['twitter:title', first(head, 'twitter:title')]);
    descriptions.push(['og:description', first(head, 'og:description')], ['twitter:description', first(head, 'twitter:description')]);
  }
  for (const [key, v = ''] of titles) {
    r.expect(v.length >= TITLE_RANGE[0] && v.length <= TITLE_RANGE[1], url, C.text, `${key} is ${v.length} characters (want ${TITLE_RANGE.join('-')}): ${v}`);
  }
  for (const [key, v = ''] of descriptions) {
    r.expect(v.length >= DESCRIPTION_RANGE[0] && v.length <= DESCRIPTION_RANGE[1], url, C.text, `${key} is ${v.length} characters (want ${DESCRIPTION_RANGE.join('-')}): ${v}`);
  }
}

export async function checkIndexable(page: Page, ctx: Ctx): Promise<void> {
  const { head, url, locale, path } = page;
  const r = ctx.report;
  const canonical = abs(locale, path);

  r.expect(head.lang === locale, url, C.lang, `<html lang="${head.lang}">, expected "${locale}"`);
  checkLengths(page, ctx);
  checkCopy(page, ctx);

  // 4: canonical
  r.expect(head.canonicals.length === 1, url, C.canonical, `${head.canonicals.length} canonical links`);
  r.expect(head.canonicals[0] === canonical, url, C.canonical, `canonical ${head.canonicals[0]}, expected ${canonical}`);

  // 5: hreflang
  const want: Record<string, string> = { 'x-default': abs('en', path) };
  for (const l of LOCALES) want[HREFLANG[l]] = abs(l, path);
  const got: Record<string, string> = {};
  for (const a of head.alternates) {
    r.expect(!(a.hreflang in got), url, C.hreflang, `hreflang ${a.hreflang} listed twice`);
    got[a.hreflang] = a.href;
  }
  r.expect(JSON.stringify(sortKeys(got)) === JSON.stringify(sortKeys(want)), url, C.hreflang, `alternates ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

  await checkSocial(page, ctx, canonical, { card: 'file' });
  checkJsonLd(page, ctx, canonical);

  // 8: robots
  r.expect(!isNoindex(head), url, C.robots, `indexable page carries robots "${head.robots.join(' | ')}"`);
  r.expect(new Set(head.robots).size === head.robots.length && head.robots.length <= 1, url, C.robots, `${head.robots.length} robots meta tags: ${head.robots.join(' | ')}`);

  await checkHeadLinks(page, ctx);
}

async function checkHeadLinks(page: Page, ctx: Ctx): Promise<void> {
  const { head, url } = page;
  const r = ctx.report;
  r.expect(head.manifest === '/manifest.webmanifest', url, C.head, `manifest link ${head.manifest}`);
  r.expect(Boolean(head.themeColor), url, C.head, 'no theme-color');
  r.expect(/width=device-width/.test(head.viewport ?? ''), url, C.head, `viewport "${head.viewport}"`);
  r.expect(!/user-scalable=no|maximum-scale=1(?![.\d])/.test(head.viewport ?? ''), url, C.head, `viewport blocks zooming on a public page: "${head.viewport}"`);
  for (const icon of head.icons) {
    const res = await get(ctx.base, icon);
    r.expect(res.status === 200 && res.contentType.startsWith('image/'), url, C.head, `icon ${icon}: ${res.status} ${res.contentType}`);
  }
}

function sortKeys(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}
