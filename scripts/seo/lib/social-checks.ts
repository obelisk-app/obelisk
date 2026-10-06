/**
 * Check 6: the link preview. Every tag LinkedIn, WhatsApp, X and Facebook
 * read is present and agrees with the page; the image is the page's own
 * 1200x630 PNG or JPEG, small enough for WhatsApp; no two pages (or two
 * languages of a page) share an image; and each preview bot, with no
 * cookie, with and without `Accept-Language: es`, gets a 200 with the tags
 * in the server HTML.
 */

import { createHash } from 'node:crypto';
import { LOCALES, OG_LOCALE, SITE } from './expect';
import { first, parseHead } from './head';
import { fetchAs, get, mapLimit, sitePath } from './http';
import { imageSize } from './image-size';
import { CHECKS as C } from './report';
import type { Ctx, Page } from './page-checks';

/** page URL -> its og:image and the image's hash, for the uniqueness check. */
export type ImageHashes = Map<string, { image: string; hash: string; bytes: number; size: string }>;

const MAX_BYTES = 300 * 1024;
const REQUIRED = [
  'og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:locale', 'og:locale:alternate',
  'og:image', 'og:image:width', 'og:image:height', 'og:image:type', 'og:image:alt',
  'twitter:card', 'twitter:site', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt',
];

export const PREVIEW_BOTS = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  'Twitterbot/1.0',
  'WhatsApp/2.23.20.0',
];

/**
 * `record` adds the page to the uniqueness check: every indexed page and
 * every shared link; the app shell and the voice tool are left out.
 */
export async function checkSocial(page: Page, ctx: Ctx, ogUrl: string, opts: { userContent?: boolean; record?: boolean } = {}): Promise<void> {
  const { userContent = false, record = true } = opts;
  const { head, url, locale } = page;
  const r = ctx.report;
  for (const key of REQUIRED) r.expect(Boolean(first(head, key)), url, C.social, `missing ${key}`);
  r.expect(first(head, 'og:url') === ogUrl, url, C.social, `og:url ${first(head, 'og:url')}, expected ${ogUrl}`);
  r.expect(['website', 'article', 'profile'].includes(first(head, 'og:type') ?? ''), url, C.social, `og:type "${first(head, 'og:type')}"`);
  r.expect(first(head, 'og:site_name') === 'Obelisk', url, C.social, `og:site_name "${first(head, 'og:site_name')}"`);
  r.expect(first(head, 'og:locale') === OG_LOCALE[locale], url, C.social, `og:locale ${first(head, 'og:locale')}, expected ${OG_LOCALE[locale]}`);
  const alt = [...(head.meta.get('og:locale:alternate') ?? [])].sort();
  const wantAlt = LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]).sort();
  r.expect(JSON.stringify(alt) === JSON.stringify(wantAlt), url, C.social, `og:locale:alternate ${alt.join(',')}, expected ${wantAlt.join(',')}`);
  r.expect(first(head, 'twitter:card') === 'summary_large_image', url, C.social, `twitter:card "${first(head, 'twitter:card')}"`);
  // One title and one description everywhere: the tab, the result and the card say the same.
  r.expect(first(head, 'og:title') === head.titles[0] && first(head, 'twitter:title') === head.titles[0], url, C.social, 'og:title / twitter:title differ from <title>');
  if (!userContent || head.descriptions[0]) {
    r.expect(first(head, 'og:description') === head.descriptions[0] && first(head, 'twitter:description') === head.descriptions[0], url, C.social, 'og:description / twitter:description differ from the meta description');
  }
  const images = head.meta.get('og:image') ?? [];
  r.expect(images.length === 1, url, C.social, `${images.length} og:image tags`);
  const src = images[0];
  if (!src) return;
  r.expect(first(head, 'twitter:image') === src, url, C.social, `twitter:image ${first(head, 'twitter:image')} is not og:image ${src}`);
  const declared = {
    width: Number(first(head, 'og:image:width')), height: Number(first(head, 'og:image:height')), type: first(head, 'og:image:type') ?? '',
  };
  const info = await checkImage(src, url, ctx, declared);
  if (info && record) ctx.images.set(url, info);
}

/** The card answers 200 as a PNG or JPEG, is 1200x630 as declared, and is under 300 KB. */
async function checkImage(src: string, url: string, ctx: Ctx, declared: { width: number; height: number; type: string }) {
  const r = ctx.report;
  if (!r.expect(src.startsWith(`${SITE}/`), url, C.social, `og:image is not an absolute https URL on the site: ${src}`)) return null;
  const res = await get(ctx.base, sitePath(src, SITE));
  if (!r.expect(res.status === 200, url, C.social, `og:image ${src} answers ${res.status}${res.location ? ` -> ${res.location}` : ''}`)) return null;
  const type = res.contentType.split(';')[0].trim();
  r.expect(type === 'image/png' || type === 'image/jpeg', url, C.social, `og:image ${src} is ${type}, not PNG or JPEG`);
  r.expect(declared.type === type, url, C.social, `og:image:type "${declared.type}", served as ${type}`);
  const size = imageSize(res.body);
  const dims = size ? `${size.width}x${size.height}` : 'unreadable';
  r.expect(dims === '1200x630', url, C.social, `og:image ${src} is ${dims}, not 1200x630`);
  r.expect(declared.width === 1200 && declared.height === 630, url, C.social, `og:image:width/height ${declared.width}x${declared.height}`);
  r.expect(res.body.length < MAX_BYTES, url, C.social, `og:image ${src} is ${Math.round(res.body.length / 1024)} KB (WhatsApp wants under 300 KB)`);
  return { image: src, hash: createHash('sha256').update(res.body).digest('hex'), bytes: res.body.length, size: dims };
}

/** No two pages share an image (and so no language of a page shares the English one). */
export function checkUniqueImages(ctx: Ctx): void {
  const byHash = new Map<string, string>();
  for (const [url, info] of ctx.images) {
    const other = byHash.get(info.hash);
    ctx.report.expect(!other, url, C.social, `serves the same preview image as ${other} (${info.image})`);
    if (!other) byHash.set(info.hash, url);
  }
}

/** Each preview bot, no cookie, with and without Spanish: a 200 carrying the card in the server HTML. */
export async function checkBots(targets: Array<{ path: string; ogUrl: string }>, ctx: Ctx): Promise<void> {
  const runs = targets.flatMap((t) => PREVIEW_BOTS.flatMap((ua) => [{ ...t, ua, lang: '' }, { ...t, ua, lang: 'es' }]));
  await mapLimit(runs, 8, async ({ path, ogUrl, ua, lang }) => {
    const label = `${path} as ${ua.split(/[/ ]/)[0]}${lang ? ' (Accept-Language es)' : ''}`;
    const res = await fetchAs(ctx.base, path, ua, lang ? { 'accept-language': lang } : {});
    if (!ctx.report.expect(res.status === 200, label, C.social, `answers ${res.status}${res.location ? ` -> ${res.location}` : ''}`)) return;
    const head = parseHead(res.text.split('</head>')[0] + '</head>');
    ctx.report.expect(first(head, 'og:url') === ogUrl && Boolean(first(head, 'og:image')) && Boolean(first(head, 'og:title')) && first(head, 'twitter:card') === 'summary_large_image', label, C.social, 'the card is not in the server <head>');
  });
}
