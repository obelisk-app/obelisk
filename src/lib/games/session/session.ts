/**
 * Deterministic replay: an event log in, a board out.
 *
 * Every client runs this over the same relay-delivered kind 2390 events and
 * must land on the same `GameSession`. That agreement is the entire trust
 * model - see `protocol.ts` for why there is no referee.
 *
 * The ordering rules that make replay stable:
 *
 *   1. Events sort by `(created_at, id)`. `id` is a hash, so the tiebreak is
 *      total and identical everywhere - no "whoever the relay echoed first".
 *   2. A `move` is only applied when it comes from the player to move AND
 *      carries the current turn index `n`. A duplicate, a replay, or a move
 *      published against a stale view of the board fails one of those two
 *      tests and is dropped, so clock skew cannot reorder a match.
 *   3. Everything the engine rejects (`validateAction`) is dropped, silently.
 *      An opponent publishing an illegal cell has published noise.
 *
 * What replay cannot fix: a player who simply stops publishing. That is what
 * the turn clock is for - after `turnTimeoutS`, ANY participant may publish a
 * `timeout` for that turn, and because the deadline is derived from the log
 * (not from the claimant's clock), everyone else accepts or rejects the claim
 * identically.
 */
import { WAITING_EXPIRY_MINUTES, type ParsedGameEvent } from '../protocol/protocol';
import type { GameSession } from './session-types';
import { replayLog } from './session-replay';
import { getGameDef, isKnownGame } from '../core/registry';

export type { GameSession, GameStatus } from './session-types';
export { replayLog } from './session-replay';
export {
  canJoin,
  canStart,
  controllerOf,
  isMyTurn,
  isSoloTable,
  isTurnExpired,
  seatsControlledBy,
  turnSecondsLeft,
} from './session-queries';

/**
 * Rebuild one table from its events.
 *
 * @param events - every kind 2390 event carrying this table's id, in any order.
 * @param now - unix seconds, injected so the "stale waiting table" and
 *   "clock expired" reads are testable and never differ between a render and
 *   a re-render mid-second.
 * @returns the session, or `null` when the log has no usable `create`.
 */
export function deriveSession(
  events: readonly ParsedGameEvent[],
  now: number = Math.floor(Date.now() / 1000),
): GameSession | null {
  const session = replayLog(events);
  return session ? applyWaitingExpiry(session, now) : null;
}

/**
 * The one thing about a table that the wall clock decides: a table nobody ever
 * started stops being interesting after an hour. Derived, not published - no
 * event, no signature, same answer on every client that agrees roughly what
 * time it is.
 *
 * Returns `session` itself when nothing has expired, and a **clone** when it
 * has. Never mutates: the caller may be holding a cached replay shared with
 * other renders, and flipping its status in place would change what everyone
 * sees without changing the object identity React compares.
 */
export function applyWaitingExpiry(session: GameSession, now: number): GameSession {
  if (session.status !== 'waiting') return session;
  if (now - session.createdAt <= WAITING_EXPIRY_MINUTES * 60) return session;
  return { ...session, status: 'cancelled' };
}

/**
 * The game a log's replay needs: that of its earliest `create`, the one
 * `replayLog` uses. Null when there is no create yet.
 */
export function tableGame(events: readonly ParsedGameEvent[]): string | null {
  let first: ParsedGameEvent | null = null;
  for (const e of events) {
    if (e.op !== 'create') continue;
    if (!first || e.createdAt < first.createdAt || (e.createdAt === first.createdAt && e.id < first.id)) first = e;
  }
  return first && first.op === 'create' ? first.game : null;
}

/**
 * The game whose engine this log is waiting for, or null when replay can
 * run now: the engine is loaded, the game is unknown (replay says null and
 * always will), or there is no create to replay yet.
 *
 * A null replay means "nothing to show" in the first three cases and
 * "not yet" in this one, so a cache of replays must not keep this one.
 */
export function pendingEngine(events: readonly ParsedGameEvent[]): string | null {
  const game = tableGame(events);
  if (game === null || !isKnownGame(game) || getGameDef(game)) return null;
  return game;
}
