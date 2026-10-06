/**
 * What the site should look like to a crawler, written down independently
 * of the code that produces it: if the metadata builders drift, this file
 * is the reference they are checked against, not a copy of them.
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { nip19 } from 'nostr-tools';

export const SITE = process.env.SEO_SITE || 'https://obelisk.ar';
export const LOCALES = ['en', 'es', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * hreflang codes: plain languages. One Spanish version serves every
 * Spanish-speaking country and one Portuguese version Brazil and Portugal,
 * so a region code (`es-AR`) would tell search engines the page is only for
 * Argentina and send a reader in Mexico to the x-default (English) instead.
 */
export const HREFLANG: Record<Locale, string> = { en: 'en', es: 'es', pt: 'pt' };
/** og:locale needs a territory; the copy is Argentine Spanish and Brazilian Portuguese. */
export const OG_LOCALE: Record<Locale, string> = { en: 'en_US', es: 'es_AR', pt: 'pt_BR' };

/** `/guides` in `es` is `/es/guides`; `/` in `pt` is `/pt`. */
export function localPath(locale: Locale, p: string): string {
  if (locale === 'en') return p;
  return p === '/' ? `/${locale}` : `/${locale}${p}`;
}

export function abs(locale: Locale, p: string): string {
  const lp = localPath(locale, p);
  return lp === '/' ? SITE : `${SITE}${lp}`;
}

/** The locale and locale-free path of a site path (`/es/guides` -> es, `/guides`). */
export function splitLocale(sitePath: string): { locale: Locale; path: string } {
  for (const l of LOCALES) {
    if (l === 'en') continue;
    if (sitePath === `/${l}`) return { locale: l, path: '/' };
    if (sitePath.startsWith(`/${l}/`)) return { locale: l, path: sitePath.slice(l.length + 1) };
  }
  return { locale: 'en', path: sitePath || '/' };
}

const GUIDES_ROOT = path.join(process.cwd(), 'content', 'guides');

export type GuideDates = { publishedAt: string; updatedAt: string; title: string; description: string };

export function guideSlugs(): string[] {
  return fs.readdirSync(path.join(GUIDES_ROOT, 'en')).filter((f) => f.endsWith('.mdx')).map((f) => f.replace(/\.mdx$/, '')).sort();
}

/** A guide's front matter in one language, English when it is not translated. */
export function guideFrontMatter(locale: Locale, slug: string): GuideDates {
  const own = path.join(GUIDES_ROOT, locale, `${slug}.mdx`);
  const file = fs.existsSync(own) ? own : path.join(GUIDES_ROOT, 'en', `${slug}.mdx`);
  const data = matter(fs.readFileSync(file, 'utf8')).data as Record<string, unknown>;
  const str = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ''));
  return { publishedAt: str(data.publishedAt), updatedAt: str(data.updatedAt), title: str(data.title), description: str(data.description) };
}

/** The pages that must be indexed, in every language, and so in the sitemap. */
export function indexablePaths(): string[] {
  const statics = ['/', '/features', '/desktop', '/mobile', '/help', '/help/local-data', '/media-kit', '/guides'];
  return [...statics, ...guideSlugs().map((s) => `/guides/${s}`)];
}

/** The `lastmod` a sitemap entry should carry: front-matter dates, or none. */
export function expectedLastmod(locale: Locale, p: string): string | null {
  const m = p.match(/^\/guides\/([a-z0-9-]+)$/);
  if (m) return guideFrontMatter(locale, m[1]).updatedAt;
  if (p === '/guides') return guideSlugs().map((s) => guideFrontMatter(locale, s).updatedAt).sort().pop() ?? null;
  return null;
}

export type RouteKind = 'noindex' | 'notfound' | 'redirect';
export type ExtraRoute = { url: string; kind: RouteKind; locale: Locale; to?: string; status?: number; share?: boolean | 'resolved'; userContent?: boolean; ownCopy?: boolean };

const SAMPLE_NPUB = 'npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9';
/** A well-formed note id; whether a relay still has it does not change the verdict (noindex either way). */
const SAMPLE_NOTE = nip19.noteEncode('0'.repeat(63) + '1');

/** Routes outside the sitemap: what each must answer. */
export function extraRoutes(): ExtraRoute[] {
  const out: ExtraRoute[] = [];
  for (const l of LOCALES) {
    const lp = (p: string) => localPath(l, p);
    out.push({ url: lp('/app'), kind: 'noindex', locale: l, ownCopy: true });
    out.push({ url: lp('/voice'), kind: 'noindex', locale: l, ownCopy: true });
    out.push({ url: lp('/voice/test'), kind: 'noindex', locale: l, ownCopy: true });
    out.push({ url: lp('/r/lacrypta'), kind: 'noindex', locale: l, share: true, ownCopy: true });
    out.push({ url: lp('/r/public'), kind: 'noindex', locale: l, share: true, ownCopy: true });
    out.push({ url: lp(`/p/${SAMPLE_NPUB}`), kind: 'noindex', locale: l, share: 'resolved', userContent: true });
    out.push({ url: lp(`/notes/${SAMPLE_NOTE}`), kind: 'noindex', locale: l, userContent: true });
    out.push({ url: lp('/t/nostr'), kind: 'noindex', locale: l, share: true });
    out.push({ url: lp('/no-such-page'), kind: 'notfound', locale: l });
    out.push({ url: lp('/guides/no-such-guide'), kind: 'notfound', locale: l });
    out.push({ url: lp('/notes/not-a-note'), kind: 'notfound', locale: l });
    out.push({ url: lp('/p/not-a-profile'), kind: 'notfound', locale: l });
  }
  out.push({ url: '/fr/app', kind: 'notfound', locale: 'en' });
  out.push({ url: '/dev/game-shots', kind: 'notfound', locale: 'en' });
  out.push({ url: '/missing-file.txt', kind: 'notfound', locale: 'en' });
  const redirects: Array<[string, string, number]> = [
    ['/guides/en', '/guides', 308], ['/guides/en/vesta', '/guides/vesta', 308],
    ['/guides/es', '/es/guides', 308], ['/guides/es/vesta', '/es/guides/vesta', 308],
    ['/guides/pt', '/pt/guides', 308], ['/guides/pt/vesta', '/pt/guides/vesta', 308],
    ['/guides/es/vesta/opengraph-image', '/es/guides/vesta/opengraph-image', 308],
    ['/chat', '/app', 308], ['/es/chat', '/es/app', 308], ['/en/app', '/app', 307], ['/en', '/', 307],
  ];
  for (const [url, to, status] of redirects) out.push({ url, to, status, kind: 'redirect', locale: 'en' });
  return out;
}
