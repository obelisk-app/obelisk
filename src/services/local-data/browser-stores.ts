/**
 * The local data that is not in web storage: the session vault's IndexedDB
 * database, the service worker's Cache Storage, and the cookies.
 * Each removal is best effort and never throws; each takes its browser API
 * as an optional argument so tests can hand in a double.
 */
import { cookieNamesOn, expireCookie } from '@/services/cookies';
import { LOCAL_DATA, entryMatches } from './inventory';
import type { LocalDataCategoryId } from './types';

const VAULT_DBS = LOCAL_DATA.filter((e) => e.area === 'indexedDB').map((e) => e.key);
const CACHE_PREFIXES = LOCAL_DATA.filter((e) => e.area === 'cacheStorage').map((e) => e.key);
const COOKIES = LOCAL_DATA.filter((e) => e.area === 'cookie');

/** Delete the session vault database. Resolves once deleted, blocked or failed. */
export function deleteVaultDatabases(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<void> {
  if (!factory) return Promise.resolve();
  return Promise.all(VAULT_DBS.map((name) => new Promise<void>((resolve) => {
    try {
      const req = factory.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      // Another tab holds it open: the browser deletes it once that closes.
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  }))).then(() => undefined);
}

function cacheStorage(store?: CacheStorage): CacheStorage | null {
  if (store) return store;
  return typeof caches === 'undefined' ? null : caches;
}

async function offlineCacheNames(store: CacheStorage): Promise<string[]> {
  const names = await store.keys();
  return names.filter((name) => CACHE_PREFIXES.some((p) => name.startsWith(p)));
}

/**
 * Approximate bytes of the offline files, from each response's
 * Content-Length (bodies are not read). `null` when it cannot be measured.
 */
export async function offlineFilesBytes(store?: CacheStorage): Promise<number | null> {
  const cs = cacheStorage(store);
  if (!cs) return null;
  try {
    let bytes = 0;
    for (const name of await offlineCacheNames(cs)) {
      const cache = await cs.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        bytes += Number(response?.headers.get('content-length') ?? 0) || 0;
      }
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Delete the offline caches and unregister the service worker, so it does
 * not refill them from this page. The next load registers it again.
 */
export async function removeOfflineFiles(
  store?: CacheStorage,
  workers: ServiceWorkerContainer | undefined = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
): Promise<void> {
  const cs = cacheStorage(store);
  try {
    const registrations = workers ? await workers.getRegistrations() : [];
    await Promise.all(registrations.map((r) => r.unregister().catch(() => false)));
  } catch { /* no service worker support */ }
  if (!cs) return;
  try {
    await Promise.all((await offlineCacheNames(cs)).map((name) => cs.delete(name)));
  } catch { /* cache storage refused */ }
}

/** The cookies on this page that belong to `categories`. */
export function cookiesIn(
  categories: ReadonlyArray<LocalDataCategoryId>,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): string[] {
  if (!doc) return [];
  const entries = COOKIES.filter((e) => categories.includes(e.category));
  return cookieNamesOn(doc).filter((name) => entries.some((e) => entryMatches(e, 'cookie', name)));
}

/** Expire the cookies of `categories`, on the host and on each parent domain. */
export function removeCookies(
  categories: ReadonlyArray<LocalDataCategoryId>,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): void {
  if (!doc) return;
  for (const name of cookiesIn(categories, doc)) expireCookie(name, doc);
}
