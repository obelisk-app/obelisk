/**
 * Everything Obelisk keeps in the browser, as one typed list. Settings
 * (Data on this device), the `/help/local-data` page and the inventory guard
 * test (`tests/services/local-data/inventory-guard.test.ts`) all read it, so
 * a new storage key that is not listed here fails the test suite.
 *
 * Adding storage: put the entry in `inventory-cache.ts` (anything the relays
 * can send again) or `inventory-device.ts` (choices and secrets), in the
 * category a person would look for it under.
 */
import { CACHE_ENTRIES } from './inventory-cache';
import { DEVICE_ENTRIES } from './inventory-device';
import type { LocalDataArea, LocalDataCategoryId, LocalDataEntry } from './types';

export type { LocalDataArea, LocalDataCategoryId, LocalDataEntry } from './types';
export { isProfileCacheKey, isReadStateCacheKey } from './inventory-cache';

export const LOCAL_DATA: ReadonlyArray<LocalDataEntry> = [...CACHE_ENTRIES, ...DEVICE_ENTRIES];

/** Does `key` (in `area`) belong to `entry`? */
export function entryMatches(entry: LocalDataEntry, area: LocalDataArea, key: string): boolean {
  if (entry.area !== area) return false;
  const hit = entry.match === 'exact' ? key === entry.key : key.startsWith(entry.key);
  return hit && (entry.when ? entry.when(key) : true);
}

/** The entry that owns `key`, or `undefined` for a key the app does not know. */
export function entryForKey(area: LocalDataArea, key: string): LocalDataEntry | undefined {
  return LOCAL_DATA.find((entry) => entryMatches(entry, area, key));
}

/** The category `key` belongs to, if any. */
export function categoryOfKey(area: LocalDataArea, key: string): LocalDataCategoryId | undefined {
  return entryForKey(area, key)?.category;
}

/** The entries of one category. */
export function entriesIn(category: LocalDataCategoryId): LocalDataEntry[] {
  return LOCAL_DATA.filter((entry) => entry.category === category);
}
