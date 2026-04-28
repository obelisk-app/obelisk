/**
 * NIP-11 relay information document fetcher.
 *
 * Each relay exposes metadata at the same URL with the wss/ws scheme
 * swapped for https/http and Accept: application/nostr+json. We cache
 * results in localStorage to avoid re-hitting every page load.
 */

export type RelayInfo = {
  name?: string;
  description?: string;
  icon?: string;
  /** When the entry was fetched (ms epoch). Used for TTL. */
  fetchedAt: number;
};

const CACHE_KEY = 'obelisk:relay-info-v1';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 5000;

type Cache = Record<string, RelayInfo>;

function readCache(): Cache {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Cache;
  } catch {
    return {};
  }
}

function writeCache(c: Cache) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // quota / serialization — ignore
  }
}

function toHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
}

/** Best-effort favicon URL for a relay's host. */
export function faviconFor(wsUrl: string): string | null {
  try {
    const u = new URL(wsUrl);
    return `${u.protocol === 'ws:' ? 'http:' : 'https:'}//${u.host}/favicon.ico`;
  } catch {
    return null;
  }
}

const inflight = new Map<string, Promise<RelayInfo | null>>();

export async function fetchRelayInfo(wsUrl: string): Promise<RelayInfo | null> {
  const cache = readCache();
  const cached = cache[wsUrl];
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  const existing = inflight.get(wsUrl);
  if (existing) return existing;

  const p = (async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(toHttpUrl(wsUrl), {
        headers: { Accept: 'application/nostr+json' },
        signal: ctl.signal,
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { name?: string; description?: string; icon?: string };
      const info: RelayInfo = {
        name: typeof json.name === 'string' ? json.name : undefined,
        description: typeof json.description === 'string' ? json.description : undefined,
        icon: typeof json.icon === 'string' ? json.icon : undefined,
        fetchedAt: Date.now(),
      };
      const next = readCache();
      next[wsUrl] = info;
      writeCache(next);
      return info;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
      inflight.delete(wsUrl);
    }
  })();

  inflight.set(wsUrl, p);
  return p;
}
