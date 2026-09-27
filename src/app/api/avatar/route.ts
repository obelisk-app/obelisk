/**
 * Profile pictures for sandboxed apps.
 *
 * An app never gets an image URL (a URL is a network request the app could
 * use to leak data or track the user — obelisk-apps docs/security.md), so the
 * host hands it the picture's bytes. Fetching those bytes from the browser
 * fails for most image hosts: they don't send CORS headers, so a player whose
 * avatar lives on one showed up as initials inside every game. Fetching them
 * here works for all of them, and has a privacy upside: the image host sees
 * this server, not each player.
 *
 * It is the link-preview route's SSRF problem again — a server fetching URLs
 * an anonymous user chose — with the same answer: http(s) only, every
 * redirect hop resolved and refused if ANY address is private, a byte
 * ceiling, a timeout, a per-IP budget. Only raster images come back (never
 * SVG, which can carry script), served with nosniff and a sandbox CSP so the
 * response can't act as a page on this origin.
 */
import { NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import net from 'node:net';

import { isBlockedAddress } from '@/lib/link-preview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AVATAR_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;
/** Per-IP budget: a game fetches a handful, a page full of cards a few dozen. */
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const UA = 'Mozilla/5.0 (compatible; ObeliskBot/1.0; +https://obelisk.ar)';

const AVATAR_TYPES = /^image\/(png|jpeg|webp|gif|avif)$/;

const cache = new Map<string, { at: number; type: string; body: Buffer }>();
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (hits.size > 5_000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error('blocked address');
    return;
  }
  const resolved = await dns.lookup(hostname, { all: true });
  if (resolved.length === 0) throw new Error('unresolvable');
  for (const { address } of resolved) if (isBlockedAddress(address)) throw new Error('blocked address');
}

/** Follow redirects by hand so every hop is checked before it is fetched. */
async function fetchImage(startUrl: string): Promise<{ type: string; body: Buffer } | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    await assertPublicHost(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) return null;
      const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!AVATAR_TYPES.test(type)) return null;
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_AVATAR_BYTES) return null;

      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.length;
        if (total > MAX_AVATAR_BYTES) {
          await reader.cancel();
          return null; // too big: refuse rather than hand back half a picture
        }
        chunks.push(value);
      }
      return { type, body: Buffer.concat(chunks.map((c) => Buffer.from(c))) };
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function imageResponse(type: string, body: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url || url.length > 2048) return new NextResponse(null, { status: 400 });
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return new NextResponse(null, { status: 400 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return imageResponse(hit.type, hit.body);

  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) return new NextResponse(null, { status: 429 });

  let image: { type: string; body: Buffer } | null = null;
  try {
    image = await fetchImage(url);
  } catch {
    image = null;
  }
  if (!image) return new NextResponse(null, { status: 404 });

  cache.set(url, { at: Date.now(), ...image });
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return imageResponse(image.type, image.body);
}
