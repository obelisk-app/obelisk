/**
 * Link previews for chat messages.
 *
 * A browser cannot read a third-party page to pull its OpenGraph tags - CORS
 * forbids it - so the unfurl has to happen here. That makes this endpoint a
 * server that fetches URLs an anonymous user chose, which is the classic SSRF
 * shape: without care it will happily read the cloud metadata service, the
 * relay's own admin API on localhost, or anything else on the private network
 * and hand the body back to whoever asked. The guards live beside this file:
 * `safe-fetch.ts` (private-network block, hand-followed redirects, size
 * cap), `rate-limit.ts` (per-IP budget) and `preview-cache.ts`.
 *
 * x.com is special-cased because it has to be. Measured against the live site:
 * it serves NO OpenGraph or twitter: meta at all, not even to a bot
 * user-agent - no title, no description, no image. Generic scraping cannot
 * ever produce an x.com preview, which is why they were blank. Its oEmbed
 * endpoint does work, needs no API key, and returns the post text and author,
 * so links to X resolve through that instead.
 */

import { NextResponse } from 'next/server';
import { isX, type LinkPreview } from '@/utils/link-preview/link-preview';
import { cachedPreview, storePreview } from '@/services/server/link-preview/preview-cache';
import { previewGeneric } from '@/services/server/link-preview/preview-generic';
import { previewX } from '@/services/server/link-preview/preview-x';
import { rateLimited } from '@/services/server/link-preview/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const cached = cachedPreview(key);
  if (cached) {
    return NextResponse.json(cached.value ?? { error: 'no preview' }, {
      status: cached.value ? 200 : 404,
      headers: { 'cache-control': 'public, max-age=3600' },
    });
  }

  let preview: LinkPreview | null = null;
  try {
    preview = isX(parsed.hostname) ? await previewX(key, parsed) : await previewGeneric(key);
  } catch {
    preview = null;
  }

  storePreview(key, preview);

  if (!preview) return NextResponse.json({ error: 'no preview' }, { status: 404 });
  return NextResponse.json(preview, { headers: { 'cache-control': 'public, max-age=3600' } });
}
