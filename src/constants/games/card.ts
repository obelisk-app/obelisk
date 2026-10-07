/**
 * Games: card. Values the code in `hooks/games/card/useGameCard.ts` reads,
 * kept here so every reader imports the one copy.
 */

/**
 * How long a card without a session waits before asking the relay for its own
 * table. Long enough that a card the channel backfill is about to resolve
 * anyway doesn't cost a REQ; short enough that nobody reads it as a delay.
 */
export const RESOLVE_GRACE_MS = 400;
