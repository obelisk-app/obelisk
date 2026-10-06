/**
 * The wire form of a Vesta move, and its translation back into upstream's
 * move: the player index and the dice are filled in by us, never by the
 * sender. Shared by the definition, the rules and the sequencing.
 */
import type { GameMove } from 'vesta';
import type { MoveContext } from '../types';
import { diceFromEntropy } from './dice';

/** A move as it travels on the wire: upstream's move minus `player`. */
export type VestaAction = Omit<Extract<GameMove, { player: number }>, 'player'> | { type: 'end-turn' };

export function seatIndex(participants: string[], seat: string): number {
  return participants.indexOf(seat);
}

/**
 * Rebuild the wire action into an upstream move, with the player index and
 * (for a roll) the dice filled in by us rather than by the sender.
 */
export function toMove(action: VestaAction, playerIdx: number, ctx?: MoveContext): GameMove {
  const base = { ...(action as Record<string, unknown>), player: playerIdx };
  if (action.type === 'roll-dice') {
    return { ...base, dice: diceFromEntropy(ctx?.entropy ?? '') } as GameMove;
  }
  return base as GameMove;
}
