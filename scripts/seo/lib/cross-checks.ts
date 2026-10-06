/**
 * Checks that need every page at once: titles and descriptions unique
 * across the site, Spanish and Portuguese pages never repeating the English
 * text (head or JSON-LD), and hreflang alternates that agree with each other
 * and with the sitemap.
 */

import { abs } from './expect';
import { first } from './head';
import { textValues } from './jsonld';
import { CHECKS as C, type Report } from './report';
import type { Page } from './page-checks';
import type { SitemapEntry } from './sitemap-checks';

/** Brand and protocol strings that are the same in every language. */
const SAME_EVERYWHERE = /^(Obelisk|La Crypta|Guides?|Gu[ií]as?)$/;

export function crossChecks(pages: Page[], sitemap: Map<string, SitemapEntry>, report: Report): void {
  unique(pages, report, (p) => p.head.titles[0], 'title');
  unique(pages, report, (p) => p.head.descriptions[0], 'description');

  const byUrl = new Map(pages.map((p) => [abs(p.locale, p.path), p]));
  for (const page of pages) {
    const self = abs(page.locale, page.path);
    const alts = altMap(page);
    for (const [lang, href] of Object.entries(alts)) {
      const other = byUrl.get(href);
      if (!other) continue;
      report.expect(JSON.stringify(altMap(other)) === JSON.stringify(alts), self, C.hreflang, `not reciprocal with ${lang} ${href}`);
    }
    const entry = sitemap.get(self);
    if (report.expect(Boolean(entry), self, C.sitemap, 'indexable page missing from the sitemap') && entry) {
      report.expect(JSON.stringify(sorted(entry.alternates)) === JSON.stringify(alts), self, C.sitemap, 'sitemap alternates differ from the page head');
    }
    if (page.locale === 'en') continue;
    const en = byUrl.get(abs('en', page.path));
    if (!en) continue;
    for (const key of ['title', 'description', 'og:title', 'og:description', 'twitter:description', 'og:image:alt']) {
      const mine = text(page, key);
      report.expect(!mine || mine !== text(en, key), self, C.text, `${key} is the English text: ${mine}`);
    }
    const enTexts = new Set(en.head.jsonLd.flatMap((b) => textValues(b.data)));
    for (const t of page.head.jsonLd.flatMap((b) => textValues(b.data))) {
      if (t.length < 16 || SAME_EVERYWHERE.test(t)) continue;
      report.expect(!enTexts.has(t), self, C.jsonld, `JSON-LD text is the English text: ${t.slice(0, 80)}`);
    }
  }
}

function text(page: Page, key: string): string | undefined {
  if (key === 'title') return page.head.titles[0];
  if (key === 'description') return page.head.descriptions[0];
  return first(page.head, key);
}

function unique(pages: Page[], report: Report, pick: (p: Page) => string | undefined, label: string): void {
  const seen = new Map<string, string>();
  for (const p of pages) {
    const v = pick(p);
    const url = abs(p.locale, p.path);
    if (!v) continue;
    const prev = seen.get(v);
    report.expect(!prev, url, C.text, `${label} duplicates ${prev}: ${v}`);
    if (!prev) seen.set(v, url);
  }
}

function altMap(page: Page): Record<string, string> {
  return sorted(Object.fromEntries(page.head.alternates.map((a) => [a.hreflang, a.href])));
}

function sorted(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}
