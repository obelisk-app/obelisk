/**
 * Link previews for chat messages.
 *
 * A browser cannot read a third-party page to pull its OpenGraph tags — CORS
 * forbids it — so the unfurl has to happen here. That makes this endpoint a
 * server that fetches URLs an anonymous user chose, which is the classic SSRF
 * shape: without care it will happily read the cloud metadata service, the
 * relay's own admin API on localhost, or anything else on the private network
 * and hand the body back to whoever asked. Most of this file is that problem.
 *
 * x.com is special-cased because it has to be. Measured against the live site:
 * it serves NO OpenGraph or twitter: meta at all, not even to a bot
 * user-agent — no title, no description, no image. Generic scraping cannot
 * ever produce an x.com preview, which is why they were blank. Its oEmbed
 * endpoint does work, needs no API key, and returns the post text and author,
 * so links to X resolve through that instead.
 */

import { NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import net from 'node:net';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stop reading a page after this. OG tags live in <head>; nothing past this is useful. */
const MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 3;

/** Successful unfurls are cached this long; failures much shorter, so a site that was down is retried. */
const CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

/** Per-IP budget. This endpoint makes outbound requests, so it must not become an open proxy. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

const UA = 'Mozilla/5.0 (compatible; ObeliskBot/1.0; +https://obelisk.ar)';

export interface LinkPreview {
  url: string;
  kind: 'link' | 'post';
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
}

const cache = new Map<string, { at: number; ttl: number; value: LinkPreview | null }>();
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (hits.size > 5_000) {
      for (const [key, value] of hits) if (now > value.resetAt) hits.delete(key);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

/**
 * Reject anything that resolves to an address we should not be reaching.
 *
 * Checked against the resolved IPs rather than the hostname, because a
 * hostname is attacker-controlled and can point anywhere — `evil.com` with an
 * A record of 169.254.169.254 is the whole attack. Every redirect hop is
 * re-checked for the same reason.
 */
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  const v6 = ip.toLowerCase().split('%')[0];
  if (v6 === '::' || v6 === '::1') return true;
  if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
  if (v6.startsWith('::ffff:')) return isBlockedAddress(v6.slice(7)); // v4-mapped
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error('blocked address');
    return;
  }
  const resolved = await dns.lookup(hostname, { all: true });
  if (resolved.length === 0) throw new Error('unresolvable');
  // Every answer must be public: one private record is enough to abuse.
  for (const { address } of resolved) {
    if (isBlockedAddress(address)) throw new Error('blocked address');
  }
}

/** Follow redirects by hand so each hop can be validated before it is fetched. */
async function safeFetch(startUrl: string): Promise<{ body: string; finalUrl: string } | null> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    await assertPublicHost(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) return null;

    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('html')) return null;

    // Read with a ceiling rather than response.text(): a hostile or merely
    // enormous page should not be pulled into memory in full.
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.length;
      if (total >= MAX_BYTES) {
        await reader.cancel();
        break;
      }
    }
    return {
      body: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8'),
      finalUrl: current,
    };
  }
  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    // Last, so a literal "&amp;mdash;" does not become an em dash.
    .replace(/&amp;/g, '&');
}

/** Pull one meta value, accepting property= or name= in either attribute order. */
export function readMeta(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*?content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim() || undefined;
  }
  return undefined;
}

function isX(hostname: string): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  return host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com';
}

/**
 * X via oEmbed.
 *
 * Verified against the live endpoint: x.com returns no og: or twitter: meta to
 * any user-agent, so there is nothing to scrape, but oEmbed still serves the
 * post text and author without credentials.
 */
async function previewX(url: string): Promise<LinkPreview | null> {
  const endpoint = `https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(url)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, headers: { 'user-agent': UA } });
    if (!response.ok) return null;
    const data = (await response.json()) as { html?: string; author_name?: string; provider_name?: string };
    if (!data.html) return null;

    // The payload is a <blockquote> of markup. Take the text, not the HTML:
    // this is untrusted third-party content and is rendered as a plain card.
    const text = decodeEntities(
      data.html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' '),
    ).trim();

    // oEmbed appends "— Author (@handle) March 21, 2006" to the post text.
    // The author is already the title, so drop it rather than saying it twice.
    const body = text.replace(/\s*\u2014\s*[^\u2014]*\(@[^)]+\)\s+\w+ \d{1,2}, \d{4}\s*$/u, '').trim();

    return {
      url,
      kind: 'post',
      title: data.author_name ? `${data.author_name} on X` : 'Post on X',
      description: (body || text).slice(0, 400) || undefined,
      siteName: data.provider_name ?? 'X',
      author: data.author_name,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function previewGeneric(url: string): Promise<LinkPreview | null> {
  const fetched = await safeFetch(url);
  if (!fetched) return null;
  const { body, finalUrl } = fetched;

  const title =
    readMeta(body, 'og:title') ??
    readMeta(body, 'twitter:title') ??
    body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();

  const description = readMeta(body, 'og:description') ?? readMeta(body, 'twitter:description');
  const rawImage = readMeta(body, 'og:image') ?? readMeta(body, 'twitter:image');

  let image: string | undefined;
  if (rawImage) {
    try {
      const absolute = new URL(rawImage, finalUrl);
      // Only https: an http image on an https page is a mixed-content block.
      if (absolute.protocol === 'https:') image = absolute.toString();
    } catch {
      image = undefined;
    }
  }

  if (!title && !description && !image) return null;

  return {
    url: finalUrl,
    kind: 'link',
    title: title ? decodeEntities(title).slice(0, 200) : undefined,
    description: description?.slice(0, 400),
    image,
    siteName: readMeta(body, 'og:site_name') ?? new URL(finalUrl).hostname.replace(/^www\./, ''),
  };
}

export async function GET(request: Request) {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const target = new URL(request.url).searchParams.get('url');
  if (!target) return NextResponse.json({ error: 'url required' }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'unsupported scheme' }, { status: 400 });
  }

  const key = parsed.toString();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) {
    return NextResponse.json(cached.value ?? { error: 'no preview' }, {
      status: cached.value ? 200 : 404,
      headers: { 'cache-control': 'public, max-age=3600' },
    });
  }

  let preview: LinkPreview | null = null;
  try {
    preview = isX(parsed.hostname) ? await previewX(key) : await previewGeneric(key);
  } catch {
    preview = null;
  }

  if (cache.size > MAX_CACHE_ENTRIES) {
    // Cheap eviction: drop the oldest insertion. Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), ttl: preview ? CACHE_TTL_MS : FAILURE_TTL_MS, value: preview });

  if (!preview) return NextResponse.json({ error: 'no preview' }, { status: 404 });
  return NextResponse.json(preview, { headers: { 'cache-control': 'public, max-age=3600' } });
}
