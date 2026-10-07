/**
 * The bridge: dm. Values the code in
 * `services/nostr-bridge/dm/relay-cache.ts`,
 * `services/nostr-bridge/dm/store-db.ts`, `services/nostr-bridge/dm/store.ts`
 * reads, kept here so every reader imports the one copy.
 */

export const RELAY_LIST_CACHE_MAX = 1000;

export const RELAY_LIST_TTL_MS = 6 * 3600 * 1000;

export const RELAY_LIST_NEGATIVE_TTL_MS = 15 * 60 * 1000;

export const DM_STORE_DB = 'obelisk-dms';

/** Events held while locked, oldest dropped first: the relays send them again on the next load. */
export const MAX_HELD = 1000;

/** Read-state callbacks waiting for the unlock, oldest dropped first, for the same reason. */
export const MAX_DEFERRED = 1000;
