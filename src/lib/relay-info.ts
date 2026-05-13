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
  /** NIP-11 `pubkey` field — relay operator hex pubkey. Used as the
   *  authoritative author for shared metadata like the channel layout. */
  pubkey?: string;
  /** When the entry was fetched (ms epoch). Used for TTL. */
  fetchedAt: number;
};

import { createLocalStore } from './local-store';

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 5000;

type Cache = Record<string, RelayInfo>;

const cacheStore = createLocalStore<Cache>('obelisk:relay-info-v2', {});

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
  const cache = cacheStore.load();
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
      const json = (await res.json()) as { name?: string; description?: string; icon?: string; pubkey?: string };
      const info: RelayInfo = {
        name: typeof json.name === 'string' ? json.name : undefined,
        description: typeof json.description === 'string' ? json.description : undefined,
        icon: typeof json.icon === 'string' ? json.icon : undefined,
        pubkey: typeof json.pubkey === 'string' && /^[0-9a-f]{64}$/i.test(json.pubkey) ? json.pubkey.toLowerCase() : undefined,
        fetchedAt: Date.now(),
      };
      const next = cacheStore.load();
      next[wsUrl] = info;
      cacheStore.save(next);
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
