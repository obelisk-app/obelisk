/**
 * Games: resolve. Values the code in `services/games/resolve.ts` reads, kept
 * here so every reader imports the one copy.
 */

/** How long ids accumulate before a batch goes out. */
export const RESOLVE_BATCH_MS = 250;

/** How long a batch's subscriptions stay open. No EOSE is exposed to us. */
export const RESOLVE_WAIT_MS = 4000;

/** Ids per batch. A filter is not a place to put an unbounded list. */
export const RESOLVE_MAX_IDS = 50;

/** Ops fetched per table. See the note above about `start` falling off. */
export const RESOLVE_OP_LIMIT = 200;

/** Backoff for ids that came back empty. Three attempts, then it stays a skeleton. */
export const RESOLVE_RETRY_MS = [4000, 12000] as const;
