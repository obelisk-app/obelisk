/**
 * Games: channel. Values the code in `hooks/games/channel/useChannelGames.ts`
 * reads, kept here so every reader imports the one copy.
 */

/**
 * How often session derivation re-runs against the wall clock. See
 * `useGameSession` - this is not the turn clock, which ticks every second.
 */
export const SESSION_CLOCK_MS = 30_000;

/**
 * Grace between a deadline passing and this client being willing to say so.
 *
 * Two things it absorbs. A move already in flight - signed, published, not yet
 * echoed back - should land before anybody reports its author. And our clock
 * is not their clock: the reducer accepts a claim whose `created_at` is past
 * the deadline, and `created_at` comes from whoever claims, so a browser
 * running a few seconds fast would otherwise cut turns short for everyone
 * else at the table.
 */
export const TIMEOUT_CLAIM_GRACE_S = 3;

/**
 * How long this client waits after (re)connecting before it claims anything.
 *
 * A turn clock derived from the log keeps running while the relay is
 * unreachable, so the moment a table comes back everyone's deadline has
 * already passed - through nobody's fault. Claiming then would hand the win
 * to whoever reconnected first. Instead we give the player on move the same
 * window on a healthy relay that the clock was supposed to give them.
 */
export const RECONNECT_CLAIM_GRACE_S = 20;
