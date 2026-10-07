/**
 * Social: feed. Values the code in `services/social/feed.ts` reads, kept here
 * so every reader imports the one copy.
 */

export const FEED_PAGE_SIZE = 50;

/** Ceiling on notes held in memory for one feed. Cache keeps fewer still. */
export const FEED_MAX_NOTES = 500;

/**
 * Relays cap the number of values in a filter field, and a heavy Nostr user
 * follows thousands of pubkeys. Splitting `authors` into chunks keeps each
 * REQ inside what relays actually accept; one oversized filter is commonly
 * answered with nothing at all, which reads as "your follows posted nothing".
 */
export const AUTHORS_PER_FILTER = 300;
