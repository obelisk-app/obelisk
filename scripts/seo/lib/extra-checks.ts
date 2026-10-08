/**
 * The routes outside the sitemap: pages that must not be indexed (the app
 * shell, voice forms, share links, public viewers), 404s, and redirects.
 */

import { SITE, type ExtraRoute } from './expect';
import { first, isNoindex, parseHead } from './head';
import { get } from './http';
import { CHECKS as C } from './report';
import { checkCopy, checkLengths, type Ctx } from './page-checks';
import { checkSocial } from './social-checks';
import type { SitemapEntry } from './sitemap-checks';

export async function checkExtra(route: ExtraRoute, ctx: Ctx, sitemap: Map<string, SitemapEntry>, homeTitles: Map<string, string>): Promise<void> {
  const r = ctx.report;
  const url = route.url;
  const res = await get(ctx.base, url);

  if (route.kind === 'redirect') {
    r.expect(res.status === route.status, url, C.status, `answers ${res.status}, expected ${route.status}`);
    const to = res.location ? new URL(res.location, ctx.base).pathname : null;
    r.expect(to === route.to, url, C.status, `redirects to ${to}, expected ${route.to}`);
    return;
  }

  const head = parseHead(res.text());
  const page = { url, locale: route.locale, path: url, head };
  if (route.kind === 'notfound') {
    r.expect(res.status === 404, url, C.status, `answers ${res.status}, expected 404`);
    r.expect(isNoindex(head), url, C.robots, '404 without noindex');
    r.expect(!head.robots.some((v) => /(^|,\s*)index\b/.test(v)), url, C.robots, `404 also says "${head.robots.join(' | ')}"`);
    const title = head.titles[0] ?? '';
    r.expect(Boolean(title) && title !== homeTitles.get(route.locale), url, C.text, `404 title is the home page's: ${title}`);
    r.expect(head.lang === null || head.lang === route.locale, url, C.lang, `404 <html lang="${head.lang}">`);
    checkLengths(page, ctx, false);
    checkCopy(page, ctx);
    return;
  }

  r.expect(res.status === 200, url, C.status, `answers ${res.status}`);
  r.expect(head.lang === route.locale, url, C.lang, `<html lang="${head.lang}">, expected "${route.locale}"`);
  r.expect(isNoindex(head), url, C.robots, `should not be indexed; robots "${head.robots.join(' | ') || 'none'}"`);
  r.expect(head.robots.length === 1, url, C.robots, `${head.robots.length} robots meta tags: ${head.robots.join(' | ')}`);
  r.expect(head.alternates.length === 0, url, C.hreflang, 'a noindex page should not advertise hreflang alternates');
  r.expect(!sitemap.has(`${SITE}${url}`), url, C.sitemap, 'noindex page listed in the sitemap');
  r.expect(head.titles.length === 1 && Boolean(head.titles[0]), url, C.text, `${head.titles.length} titles`);
  checkCopy(page, ctx, route.userContent);
  // Site copy fits the owner's windows; a note's or a profile's text is its author's.
  if (route.ownCopy) checkLengths(page, ctx);
  if (route.share === 'resolved' && !first(head, 'og:title')) {
    r.note(url, C.social, 'sample did not resolve from the relays (offline?); its card was not checked');
    return;
  }
  await checkSocial(page, ctx, `${SITE}${url === '/' ? '' : url}`, {
    userContent: route.userContent,
    record: Boolean(route.share),
    // Notes, profiles, hashtags and share links are drawn on request; the app and the voice tool are files.
    card: route.share || route.userContent ? 'live' : 'file',
  });
}
