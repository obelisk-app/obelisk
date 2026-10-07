/**
 * Local data: web storage. Values the code in
 * `services/local-data/web-storage.ts` reads, kept here so every reader
 * imports the one copy.
 */

import type { LocalDataCategoryId } from '@/services/local-data/types';

/** What the error panel's "clear cache" wipes: everything the relays send again. */
export const CACHE_CATEGORIES: ReadonlyArray<LocalDataCategoryId> = ['channels', 'profiles', 'readState', 'dms'];
