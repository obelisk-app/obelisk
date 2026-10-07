/**
 * "Clear cache": the error panel's recovery button (`ErrorPanel.tsx`).
 *
 * Wipes what the relays can send again (the categories in
 * `CACHE_CATEGORIES`: channel cache, profiles, read positions and alerts,
 * DM settings) and keeps the login, preferences and anything that exists
 * only on this device. What each category holds, and the per-category and
 * "remove everything" actions behind Settings > Data on this device, live
 * in `src/services/local-data/`.
 *
 * The wrap ledger (`obelisk-wrap-ledger:*`) is in the read-positions
 * category on purpose: it suppresses re-opening gift wraps whose effects
 * are already in the cursors, so it must go whenever they do.
 *
 * Never throws; returns the number of keys removed so the panel's
 * "cleared N" line is honest.
 */
// Not the folder's index: that would pull the categories (and their
// message keys) onto the error page, which ships `common` only.
import { removeWebStorageKeys } from './web-storage';
import { CACHE_CATEGORIES } from '@/constants/local-data/web-storage';

export function clearAllClientCacheExceptSession(): number {
  return removeWebStorageKeys(CACHE_CATEGORIES);
}
