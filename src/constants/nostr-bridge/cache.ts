/**
 * The bridge: cache. Values the code in
 * `services/nostr-bridge/cache/cache-keys.ts` reads, kept here so every reader
 * imports the one copy.
 */

// v4, evicts metadata and message cache entries written before hidden NIP-29
// groups were privacy-gated. Relays repopulate visible groups after login.
//
// Older cache namespaces are orphaned and evicted on module load.
export const KEY_PREFIX = 'obelisk-cache-v4/';

export const LEGACY_KEY_PREFIXES = ['obelisk-cache/', 'obelisk-cache-v2/', 'obelisk-cache-v3/'] as const;
