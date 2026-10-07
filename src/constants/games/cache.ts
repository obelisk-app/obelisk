/**
 * Games: cache. Values the code in `services/games/cache.ts` reads, kept here
 * so every reader imports the one copy.
 */

/**
 * Events cached per table. A table past this is skipped rather than truncated:
 * a truncated log replays to a plausible *wrong* status ("Open table" for a
 * finished match), while an absent one replays to a skeleton, which is honest.
 */
export const GAME_CACHE_EVENT_LIMIT = 120;

/** Matches CACHE_FLUSH_DELAY_MS in client.ts: one write per burst, not per event. */
export const GAME_CACHE_FLUSH_MS = 200;
