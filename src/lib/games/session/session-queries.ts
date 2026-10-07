/**
 * Questions asked of a replayed table: whose seat, whose move, how long is
 * left, who may join or start. Pure reads; re-exported from `session.ts`.
 */
import type { GameSession } from './session-types';

/**
 * Which seat is this pubkey playing? Named explicitly when they hold several,
 * inferred when there is only one, and otherwise the seat on move if they hold
 * it. Returns null when the pubkey holds no seat at this table.
 */
export function resolveSeat(session: GameSession, pubkey: string, named?: string): string | null {
  const held = session.seats.filter((s) => s.by === pubkey).map((s) => s.id);
  if (held.length === 0) return null;
  if (named) return held.includes(named) ? named : null;
  if (held.length === 1) return held[0];
  return session.currentTurn && held.includes(session.currentTurn) ? session.currentTurn : null;
}

/** Who may publish moves for a seat. Falls back to the seat id itself. */
export function controllerOf(session: GameSession, seatId: string): string {
  return session.seats.find((s) => s.id === seatId)?.by ?? seatId;
}

/** Every seat a pubkey is allowed to move for. */
export function seatsControlledBy(session: GameSession, pubkey: string | null): string[] {
  if (!pubkey) return [];
  return session.seats.filter((s) => s.by === pubkey).map((s) => s.id);
}

/** True when it is this account's move - on any of the seats it holds. */
export function isMyTurn(session: GameSession, pubkey: string | null): boolean {
  if (!pubkey || session.status !== 'in_progress' || !session.currentTurn) return false;
  return controllerOf(session, session.currentTurn) === pubkey;
}

/** True when the clock has run out on the current turn and anyone may claim it. */
export function isTurnExpired(session: GameSession, now: number = Math.floor(Date.now() / 1000)): boolean {
  return session.status === 'in_progress'
    && session.turnDeadline !== null
    && now >= session.turnDeadline;
}

/** Seconds left on the clock, or `null` when the table has no clock. */
export function turnSecondsLeft(session: GameSession, now: number = Math.floor(Date.now() / 1000)): number | null {
  if (session.status !== 'in_progress' || session.turnDeadline === null) return null;
  return Math.max(0, session.turnDeadline - now);
}

export function canJoin(session: GameSession, pubkey: string | null): boolean {
  return !!pubkey
    && session.status === 'waiting'
    && !session.joined.includes(pubkey)
    && session.joined.length < session.maxPlayers;
}

/**
 * Can the host open the seat assignment?
 *
 * Deliberately NOT "have enough people joined". A table played entirely on
 * one machine has exactly one joined account holding every seat, and gating
 * on the head-count made that impossible to start - the seat count is what
 * matters, and it is checked where the seats are actually chosen (the picker)
 * and again in `deriveSession` when the `start` event replays.
 */
export function canStart(session: GameSession, pubkey: string | null): boolean {
  return !!pubkey
    && session.status === 'waiting'
    && pubkey === session.createdBy;
}

/** Is every seat at this table signed by the same account? */
export function isSoloTable(session: GameSession): boolean {
  if (session.seats.length === 0) return false;
  const first = session.seats[0].by;
  return session.seats.every((s) => s.by === first);
}
