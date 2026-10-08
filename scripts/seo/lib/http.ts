/**
 * Fetching for the crawl: no redirect following (a redirect is a finding),
 * a crawler user agent, a small concurrency cap, and a cache so an image
 * referenced by forty pages is fetched once.
 */

/**
 * Bingbot is one of the user agents Next.js treats as "HTML-limited", so
 * metadata arrives in `<head>` before the body, as it does for every link
 * preview bot. Googlebot runs JavaScript and is served the same tags.
 */
export const CRAWLER_UA = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';

export type Response = {
  url: string;
  status: number;
  location: string | null;
  contentType: string;
  cacheControl: string;
  body: Buffer;
  text: () => string;
};

const cache = new Map<string, Promise<Response>>();

export function get(base: string, pathOrUrl: string): Promise<Response> {
  const url = new URL(pathOrUrl, base).toString();
  let hit = cache.get(url);
  if (!hit) {
    hit = fetchOnce(url);
    cache.set(url, hit);
  }
  return hit;
}

async function fetchOnce(url: string, attempt = 0): Promise<Response> {
  try {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': CRAWLER_UA } });
    const body = Buffer.from(await res.arrayBuffer());
    return {
      url,
      status: res.status,
      location: res.headers.get('location'),
      contentType: res.headers.get('content-type') ?? '',
      cacheControl: res.headers.get('cache-control') ?? '',
      body,
      text: () => body.toString('utf8'),
    };
  } catch (err) {
    if (attempt < 2) return fetchOnce(url, attempt + 1);
    throw err;
  }
}

/** One uncached request as a given client: its user agent and headers, no cookie. */
export async function fetchAs(base: string, path: string, userAgent: string, headers: Record<string, string> = {}) {
  const res = await fetch(new URL(path, base), { redirect: 'manual', headers: { 'user-agent': userAgent, ...headers } });
  return { status: res.status, location: res.headers.get('location'), text: await res.text() };
}

/** Run `fn` over `items`, `limit` at a time, keeping the input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** A site URL (`https://obelisk.ar/es/x`) as the path to request from the server under test. */
export function sitePath(siteUrl: string, site: string): string {
  if (!siteUrl.startsWith(site)) return siteUrl;
  return siteUrl.slice(site.length) || '/';
}
