/**
 * Games: ingest. Values the code in `services/games/ingest.ts` reads, kept
 * here so every reader imports the one copy.
 */

/**
 * How long a burst is allowed to accumulate. Roughly two frames: long enough
 * to swallow a socket drain, short enough that the local echo of your own move
 * is still imperceptible.
 */
export const INGEST_BATCH_MS = 32;
