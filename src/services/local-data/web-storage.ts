/**
 * The localStorage / sessionStorage half of local data: which keys belong
 * to a category, how many bytes they take, and removing them. Never throws:
 * storage can be missing (server render) or refuse access (a locked-down
 * private window), and then there is simply nothing to list or remove.
 */
import { LOCAL_DATA, entryMatches } from './inventory';
import type { LocalDataCategoryId } from '@/types/local-data/inventory';

type WebArea = 'localStorage' | 'sessionStorage';

function storageFor(area: WebArea): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return area === 'localStorage' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function allKeys(storage: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) out.push(key);
  }
  return out;
}

/** A predicate for "this key belongs to one of `categories`" in `area`. */
export function keyMatcher(area: WebArea, categories: ReadonlyArray<LocalDataCategoryId>): (key: string) => boolean {
  const entries = LOCAL_DATA.filter((e) => e.area === area && categories.includes(e.category));
  return (key) => entries.some((entry) => entryMatches(entry, area, key));
}

/** The keys in `area` that belong to `categories`. */
export function keysIn(area: WebArea, categories: ReadonlyArray<LocalDataCategoryId>): string[] {
  const storage = storageFor(area);
  if (!storage) return [];
  try {
    const owns = keyMatcher(area, categories);
    return allKeys(storage).filter(owns);
  } catch {
    return [];
  }
}

/** Approximate bytes `categories` take in localStorage: UTF-16, two bytes per character. */
export function localStorageBytes(categories: ReadonlyArray<LocalDataCategoryId>): number {
  const storage = storageFor('localStorage');
  if (!storage) return 0;
  let bytes = 0;
  for (const key of keysIn('localStorage', categories)) {
    try {
      bytes += (key.length + (storage.getItem(key)?.length ?? 0)) * 2;
    } catch { /* unreadable: count nothing */ }
  }
  return bytes;
}

/** Remove the keys of `categories` from both web storages. Returns how many were removed. */
export function removeWebStorageKeys(categories: ReadonlyArray<LocalDataCategoryId>): number {
  let removed = 0;
  for (const area of ['localStorage', 'sessionStorage'] as const) {
    const storage = storageFor(area);
    if (!storage) continue;
    for (const key of keysIn(area, categories)) {
      try {
        storage.removeItem(key);
        removed += 1;
      } catch { /* a racing quota or private-mode error: skip it */ }
    }
  }
  return removed;
}

/** Empty both web storages: every key on this origin is the app's. */
export function clearWebStorage(): void {
  for (const area of ['localStorage', 'sessionStorage'] as const) {
    try {
      storageFor(area)?.clear();
    } catch { /* storage refused */ }
  }
}
