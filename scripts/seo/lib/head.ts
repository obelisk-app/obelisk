/**
 * Everything a crawler reads from one HTML page: the `<html lang>`, the
 * title and meta tags, canonical and hreflang links, robots directives, the
 * JSON-LD blocks (parsed, or the parse error), and the visible text.
 */

import { JSDOM } from 'jsdom';

export type JsonLdBlock = { raw: string; data?: unknown; error?: string };

export type PageHead = {
  lang: string | null;
  titles: string[];
  /** `<title>` elements outside `<head>` (streamed metadata lands in the body). */
  bodyTitles: number;
  descriptions: string[];
  canonicals: string[];
  alternates: Array<{ hreflang: string; href: string }>;
  robots: string[];
  /** `og:*`, `article:*` (by property) and `twitter:*` (by name), every value in order. */
  meta: Map<string, string[]>;
  jsonLd: JsonLdBlock[];
  manifest: string | null;
  icons: string[];
  themeColor: string | null;
  viewport: string | null;
  bodyText: string;
};

export function parseHead(html: string): PageHead {
  const doc = new JSDOM(html).window.document;
  const all = (sel: string) => Array.from(doc.querySelectorAll(sel));
  const attr = (el: Element, name: string) => el.getAttribute(name) ?? '';
  const meta = new Map<string, string[]>();
  for (const el of all('meta[property], meta[name]')) {
    const key = el.getAttribute('property') ?? el.getAttribute('name') ?? '';
    if (!/^(og:|article:|twitter:|profile:)/.test(key)) continue;
    meta.set(key, [...(meta.get(key) ?? []), attr(el, 'content')]);
  }
  const jsonLd = all('script[type="application/ld+json"]').map((el): JsonLdBlock => {
    const raw = el.textContent ?? '';
    try {
      return { raw, data: JSON.parse(raw) };
    } catch (err) {
      return { raw, error: (err as Error).message };
    }
  });
  const body = doc.body?.cloneNode(true) as HTMLElement | undefined;
  body?.querySelectorAll('script, style, noscript, template').forEach((n) => n.remove());
  return {
    lang: doc.documentElement.getAttribute('lang'),
    titles: all('head title').map((el) => el.textContent ?? ''),
    bodyTitles: all('body title').length,
    descriptions: all('meta[name="description"]').map((el) => attr(el, 'content')),
    canonicals: all('link[rel="canonical"]').map((el) => attr(el, 'href')),
    alternates: all('link[rel="alternate"][hreflang]').map((el) => ({ hreflang: attr(el, 'hreflang'), href: attr(el, 'href') })),
    robots: all('meta[name="robots"]').map((el) => attr(el, 'content').toLowerCase()),
    meta,
    jsonLd,
    manifest: doc.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
    icons: all('link[rel~="icon"], link[rel="apple-touch-icon"]').map((el) => attr(el, 'href')),
    themeColor: doc.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
    viewport: doc.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
    bodyText: (body?.textContent ?? '').replace(/\s+/g, ' '),
  };
}

export const first = (head: PageHead, key: string): string | undefined => head.meta.get(key)?.[0];
export const isNoindex = (head: PageHead): boolean => head.robots.some((r) => /\bnoindex\b|\bnone\b/.test(r));
