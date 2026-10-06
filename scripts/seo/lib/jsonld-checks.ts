/**
 * Check 7 for one page: every JSON-LD block parses and validates, the
 * types this page should carry are there exactly once, `inLanguage` is the
 * page's language, URLs are absolute and canonical, an FAQ matches the text
 * on the page, and an article's dates are its front matter's.
 */

import { HREFLANG, SITE, guideFrontMatter } from './expect';
import { validateJsonLd } from './jsonld';
import { CHECKS as C } from './report';
import type { Ctx, Page } from './page-checks';

type Node = Record<string, unknown>;

/** The page-specific types each indexable page must carry (on top of WebSite and Organization). */
export function expectedTypes(path: string): string[] {
  if (path === '/') return ['WebApplication', 'FAQPage'];
  if (path === '/guides') return ['CollectionPage', 'BreadcrumbList'];
  if (/^\/guides\/[a-z0-9-]+$/.test(path)) return ['Article', 'BreadcrumbList'];
  if (path === '/desktop' || path === '/mobile') return ['ImageGallery'];
  return [];
}

/** Types a page may carry once at most. */
const SINGLE = new Set(['WebSite', 'Organization', 'WebApplication', 'SoftwareApplication', 'FAQPage', 'Article', 'TechArticle', 'BreadcrumbList', 'ItemList', 'CollectionPage', 'ImageGallery']);

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export function checkJsonLd(page: Page, ctx: Ctx, canonical: string): void {
  const { head, url, locale, path } = page;
  const r = ctx.report;
  const types: string[] = [];
  const nodes: Node[] = [];
  for (const block of head.jsonLd) {
    if (!r.expect(!block.error, url, C.jsonld, `JSON-LD does not parse: ${block.error}`)) continue;
    const v = validateJsonLd(block.data);
    for (const e of v.errors) r.fail(url, C.jsonld, e);
    for (const n of v.notes) r.note(url, C.jsonld, n);
    types.push(...v.types);
    nodes.push(...v.nodes);
  }
  for (const t of ['WebSite', 'Organization', ...expectedTypes(path)]) {
    r.expect(types.includes(t), url, C.jsonld, `no ${t} JSON-LD (has ${types.join(', ') || 'none'})`);
  }
  // The same entity referenced twice (an article's publisher is the site's
  // Organization, by @id) is one entity; two different ones are a conflict.
  const distinct = new Map<string, Set<string>>();
  for (const n of nodes) {
    const t = String(n['@type']);
    if (!SINGLE.has(t)) continue;
    distinct.set(t, (distinct.get(t) ?? new Set()).add(typeof n['@id'] === 'string' ? n['@id'] : JSON.stringify(n)));
  }
  for (const [t, ids] of distinct) r.expect(ids.size === 1, url, C.jsonld, `${ids.size} different ${t} entities; conflicting duplicates`);

  for (const n of nodes) {
    if ('inLanguage' in n) r.expect(n.inLanguage === HREFLANG[locale], url, C.jsonld, `${n['@type']} inLanguage ${String(n.inLanguage)}, expected ${HREFLANG[locale]}`);
    for (const key of ['url', 'item']) {
      const v = n[key];
      if (typeof v !== 'string' || !v.startsWith(SITE)) continue;
      r.expect(!/\/$|\?/.test(v.replace(/#.*$/, '')), url, C.jsonld, `${n['@type']}.${key} is not a canonical URL: ${v}`);
    }
    if (['TechArticle', 'Article', 'CollectionPage', 'ImageGallery', 'WebApplication'].includes(String(n['@type']))) {
      r.expect(n.url === canonical, url, C.jsonld, `${n['@type']}.url ${String(n.url)}, expected the canonical ${canonical}`);
    }
  }

  const faq = nodes.find((n) => n['@type'] === 'FAQPage');
  for (const q of (faq?.mainEntity as Node[] | undefined) ?? []) {
    const question = norm(String(q.name ?? ''));
    const answer = norm(String((q.acceptedAnswer as Node | undefined)?.text ?? ''));
    r.expect(head.bodyText.includes(question), url, C.jsonld, `FAQ question not on the page: ${question}`);
    r.expect(head.bodyText.includes(answer), url, C.jsonld, `FAQ answer not on the page: ${answer.slice(0, 80)}...`);
  }

  const slug = path.match(/^\/guides\/([a-z0-9-]+)$/)?.[1];
  const article = nodes.find((n) => n['@type'] === 'TechArticle' || n['@type'] === 'Article');
  if (slug && article) {
    const fm = guideFrontMatter(locale, slug);
    r.expect(article.datePublished === fm.publishedAt, url, C.jsonld, `datePublished ${String(article.datePublished)}, front matter says ${fm.publishedAt}`);
    r.expect(article.dateModified === fm.updatedAt, url, C.jsonld, `dateModified ${String(article.dateModified)}, front matter says ${fm.updatedAt}`);
    r.expect(article.headline === fm.title, url, C.jsonld, `headline is not the guide's title`);
  }
}
