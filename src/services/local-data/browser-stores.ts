/**
 * The local data that is not in web storage: the IndexedDB databases (the
 * session vault, the encrypted DM store), the service worker's Cache
 * Storage, and the cookies.
 * Each removal is best effort and never throws; each takes its browser API
 * as an optional argument so tests can hand in a double.
 */
import { cookieNamesOn, expireCookie } from '@/services/common/cookies';
import { LOCAL_DATA, entryMatches } from './inventory';
import type { LocalDataCategoryId } from './types';

const DATABASES = LOCAL_DATA.filter((e) => e.area === 'indexedDB');
const CACHE_PREFIXES = LOCAL_DATA.filter((e) => e.area === 'cacheStorage').map((e) => e.key);
const COOKIES = LOCAL_DATA.filter((e) => e.area === 'cookie');

/**
 * Delete the IndexedDB databases of `categories` (every one when omitted).
 * Resolves once each is deleted, blocked or failed.
 */
export function deleteDatabases(
  categories?: ReadonlyArray<LocalDataCategoryId>,
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<void> {
  if (!factory) return Promise.resolve();
  const names = DATABASES.filter((e) => !categories || categories.includes(e.category)).map((e) => e.key);
  return Promise.all(names.map((name) => new Promise<void>((resolve) => {
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

function openExisting(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

/** Approximate bytes in one store: each value as JSON, counted as UTF-16. */
function storeBytes(db: IDBDatabase, store: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      bytes += (String(cursor.key).length + (JSON.stringify(cursor.value) ?? '').length) * 2;
      cursor.continue();
    };
    tx.oncomplete = () => resolve(bytes);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'));
  });
}

/**
 * Roughly how much the databases of `category` hold, or `null` when this
 * browser cannot say (no IndexedDB, or no `databases()` to ask without
 * creating one). Only databases that already exist are opened.
 */
export async function databasesBytes(
  category: LocalDataCategoryId,
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<number | null> {
  if (!factory || typeof factory.databases !== 'function') return null;
  try {
    const existing = new Set((await factory.databases()).map((d) => d.name));
    let bytes = 0;
    for (const { key } of DATABASES.filter((e) => e.category === category && existing.has(e.key))) {
      const db = await openExisting(factory, key);
      try {
        for (const store of Array.from(db.objectStoreNames)) bytes += await storeBytes(db, store);
      } finally {
        db.close();
      }
    }
    return bytes;
  } catch {
    return null;
  }
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
