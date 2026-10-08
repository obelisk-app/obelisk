/**
 * Games: transport. Values the code in `services/games/transport.ts` reads,
 * kept here so every reader imports the one copy.
 */

/**
 * Tables fetched per channel. The relay returns the NEWEST n, so on a busy
 * Stacker channel a `create` can fall off the end of this - which is only
 * acceptable because a card resolves itself by id (`./resolve.ts`). This REQ is
 * for what is live in the channel, not for making a specific card render. Don't
 * lower it without checking that dependency still holds.
 */
export const CHANNEL_GAME_LIMIT = 400;

/**
 * How long the tagged REQ is given to produce something before we go looking
 * for a reason it hasn't.
 */
export const TAG_PROBE_MS = 2500;

/** Re-open game subscriptions after this long without a response. */
export const GAME_SUB_WATCHDOG_MS = 4000;
