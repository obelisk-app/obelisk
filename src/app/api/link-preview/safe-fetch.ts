/**
 * Fetching a URL an anonymous user chose, without letting it reach the
 * private network: every hop's host must resolve only to public addresses,
 * redirects are followed by hand so each one is checked before it is
 * fetched, only http(s) and HTML are read, and never more than `MAX_BYTES`.
 */

import { isBlockedAddress } from '@/utils/link-preview';
import dns from 'node:dns/promises';
import net from 'node:net';

/** Stop reading a page after this. OG tags live in <head>; nothing past this is useful. */
export const MAX_BYTES = 512 * 1024;
export const FETCH_TIMEOUT_MS = 6_000;
export const MAX_REDIRECTS = 3;

export const UA = 'Mozilla/5.0 (compatible; ObeliskBot/1.0; +https://obelisk.ar)';

export async function assertPublicHost(hostname: string): Promise<void> {
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
export async function safeFetch(startUrl: string): Promise<{ body: string; finalUrl: string } | null> {
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
