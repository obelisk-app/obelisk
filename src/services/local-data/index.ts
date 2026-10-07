/**
 * Local data: what Obelisk keeps in this browser, and removing it.
 * See `inventory.ts` for the list and `remove.ts` for the removals.
 */
export * from './inventory';
export * from './categories';
export { removeEverything, removeLocalDataCategory, type RemovalEnv } from './remove';
export { CONFIRM_KEYS } from '@/constants/local-data/confirm-keys';
export { measureLocalData, measureWebStorage, type CategoryUsage, type LocalDataUsage } from './sizes';
export { keysIn, removeWebStorageKeys } from './web-storage';
export { CACHE_CATEGORIES } from '@/constants/local-data/web-storage';
export { raiseWriteFence, lowerAllWriteFences } from './write-fence';
