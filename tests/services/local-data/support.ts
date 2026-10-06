/**
 * Shared helpers for the local-data tests: one realistic key per inventory
 * entry, and a Cache Storage double.
 */
import { LOCAL_DATA, type LocalDataEntry } from '@/services/local-data';

export const PUBKEY = 'a'.repeat(64);

/** Prefix entries narrowed by `when` need a key shaped like the real ones. */
const NARROWED: Record<string, string> = {
  'bridge-cache': 'obelisk-cache-v4/wss://relay.example/39000/group-1',
  'bridge-cache-profiles': `obelisk-cache-v4/wss://relay.example/0/${'b'.repeat(64)}`,
  'bridge-cache-read-state': 'obelisk-cache-v4/wss://relay.example/30078/obelisk:readstate:v1',
};

/** A key the entry owns: its exact key, or its prefix plus a per-account or per-item suffix. */
export function sampleKey(entry: LocalDataEntry): string {
  if (NARROWED[entry.id]) return NARROWED[entry.id];
  return entry.match === 'exact' ? entry.key : `${entry.key}${PUBKEY}`;
}

export const WEB_ENTRIES = LOCAL_DATA.filter(
  (e): e is LocalDataEntry & { area: 'localStorage' | 'sessionStorage' } =>
    e.area === 'localStorage' || e.area === 'sessionStorage',
);

/** Write one key for every web-storage entry. */
export function seedWebStorage(): void {
  for (const entry of WEB_ENTRIES) {
    const storage = entry.area === 'localStorage' ? localStorage : sessionStorage;
    storage.setItem(sampleKey(entry), JSON.stringify({ seeded: entry.id }));
  }
}

export function isStored(entry: LocalDataEntry): boolean {
  const storage = entry.area === 'localStorage' ? localStorage : sessionStorage;
  return storage.getItem(sampleKey(entry)) !== null;
}

/** The subset of Cache Storage the offline-files code uses. */
export class FakeCacheStorage {
  readonly stores = new Map<string, Map<string, Response>>();

  put(cacheName: string, url: string, bytes: number): void {
    const cache = this.stores.get(cacheName) ?? new Map<string, Response>();
    cache.set(url, new Response('x', { headers: { 'content-length': String(bytes) } }));
    this.stores.set(cacheName, cache);
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }

  async open(name: string) {
    const cache = this.stores.get(name) ?? new Map<string, Response>();
    return {
      keys: async () => [...cache.keys()].map((url) => new Request(url)),
      match: async (req: Request) => cache.get(req.url),
    };
  }

  asCacheStorage(): CacheStorage {
    return this as unknown as CacheStorage;
  }
}
