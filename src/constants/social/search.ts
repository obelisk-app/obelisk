/**
 * Social: search. Values the code in `services/social/search.ts` reads, kept
 * here so every reader imports the one copy.
 */

/**
 * Indexers that actually implement NIP-50. Kept alongside the user's own
 * relays because most general relays don't index full text, and a search that
 * only queries the user's four relays usually returns nothing.
 *
 * Deliberately the same list as `useNostrUserSearch.NIP50_RELAYS`; see the
 * measured health notes there.
 */
export const SEARCH_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.noswhere.com',
  'wss://search.nos.today',
];

export const SEARCH_LIMIT = 40;
