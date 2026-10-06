/**
 * `npm run seo:check`: crawl the production build the way a search engine
 * does and fail on anything wrong with what it would index.
 *
 *   npm run seo:check                       build, start `next start`, crawl, stop
 *   npm run seo:check -- --no-build         start the existing build and crawl
 *   npm run seo:check -- --base http://127.0.0.1:3000   crawl a server already running
 *   ... --json out.json                     also write every finding as JSON
 *
 * The expectations live in scripts/seo/lib/expect.ts, written independently
 * of the metadata code. Exits 1 on any failure. The numbered checks are the
 * ones in audits/obelisk/round24/seo.md.
 */

import { LOCALES, SITE, abs, extraRoutes, indexablePaths, splitLocale, type Locale } from './lib/expect';
import { parseHead } from './lib/head';
import { get, mapLimit, sitePath } from './lib/http';
import { CHECKS as C, Report } from './lib/report';
import { checkIndexable, type Ctx, type Page } from './lib/page-checks';
import { crossChecks } from './lib/cross-checks';
import { checkExtra } from './lib/extra-checks';
import { checkSitemap, readSitemap } from './lib/sitemap-checks';
import { checkManifest, checkRobots } from './lib/robots-checks';
import { build, start, type Server } from './lib/server';
import { checkBots, checkUniqueImages, type ImageHashes } from './lib/social-checks';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function crawl(base: string): Promise<Report> {
  const report = new Report();
  const images: ImageHashes = new Map();
  const ctx: Ctx = { base, report, images };
  const sitemap = await readSitemap(base, report);

  // Every indexable page, whether or not the sitemap remembered it.
  const urls = new Set<string>([...sitemap.keys()]);
  for (const p of indexablePaths()) for (const l of LOCALES) urls.add(abs(l, p));
  const pages: Page[] = [];
  await mapLimit([...urls], 6, async (siteUrl) => {
    const path = sitePath(siteUrl, SITE);
    const res = await get(base, path);
    report.pages++;
    if (!report.expect(res.status === 200, siteUrl, C.status, `answers ${res.status}${res.location ? ` -> ${res.location}` : ''}`)) return;
    const { locale, path: bare } = splitLocale(path);
    const page: Page = { url: siteUrl, locale, path: bare, head: parseHead(res.text()) };
    pages.push(page);
    await checkIndexable(page, ctx);
  });
  crossChecks(pages, sitemap, report);

  const homeTitles = new Map<Locale, string>(pages.filter((p) => p.path === '/').map((p) => [p.locale, p.head.titles[0] ?? '']));
  const extras = extraRoutes();
  await mapLimit(extras, 4, async (route) => {
    report.pages++;
    await checkExtra(route, ctx, sitemap, homeTitles);
  });

  checkUniqueImages(ctx);
  // Every indexed page and every shared link, as each preview bot fetches it.
  const shared = extras.filter((e) => e.share && e.kind === 'noindex').map((e) => ({ path: e.url, ogUrl: `${SITE}${e.url}` }));
  await checkBots([...pages.map((p) => ({ path: sitePath(p.url, SITE), ogUrl: p.url })), ...shared], ctx);

  await checkSitemap(base, sitemap, report);
  const ogImages = pages.flatMap((p) => p.head.meta.get('og:image') ?? []).map((u) => sitePath(u, SITE));
  await checkRobots(base, [...[...urls].map((u) => sitePath(u, SITE)), ...ogImages], report);
  await checkManifest(base, report);
  if (process.argv.includes('--list-images')) for (const [url, i] of images) console.log(`${url}\t${i.image}\t${i.size}\t${Math.round(i.bytes / 1024)} KB\t${i.hash.slice(0, 12)}`);
  return report;
}

async function main(): Promise<void> {
  const given = arg('--base');
  let server: Server | null = null;
  if (!given) {
    if (!process.argv.includes('--no-build')) build();
    server = await start();
  }
  const base = given ?? server!.base;
  console.log(`Crawling ${base} as ${SITE}\n`);
  try {
    const report = await crawl(base);
    report.print();
    const json = arg('--json');
    if (json) report.write(json);
    process.exitCode = report.failures.length ? 1 : 0;
  } finally {
    server?.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
