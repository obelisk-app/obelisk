/**
 * What the Vesta table shows about the seats: one tile per player and the
 * status line under them.
 */
import type { GameState } from 'vesta';
import { RESOURCES, RESOURCE_EMOJI } from '@/components/games/vesta/resources';

export interface PlayerTile {
  seat: string;
  index: number;
  /** Whose move it is. */
  onMove: boolean;
  /** One of this account's seats: its cards are shown, not just counted. */
  mine: boolean;
  vp: number;
  /** "🧱2 🪵0 ..." for my own seats, "🎴 7" (the count) for everyone else's. */
  cards: string;
}

/** Cards in a player's hand, all resources together. */
export function handSize(resources: Partial<Record<string, number>>): number {
  return RESOURCES.reduce((n, r) => n + (resources[r] ?? 0), 0);
}

export function playerTiles(
  participants: readonly string[],
  players: GameState['players'],
  turnIdx: number,
  mySeats: readonly string[],
): PlayerTile[] {
  const tiles: PlayerTile[] = [];
  participants.forEach((seat, i) => {
    const p = players[i];
    if (!p) return;
    const mine = mySeats.includes(seat);
    tiles.push({
      seat,
      index: i,
      onMove: i === turnIdx,
      mine,
      vp: p.vp,
      cards: mine
        ? RESOURCES.map((r) => `${RESOURCE_EMOJI[r]}${p.resources[r] ?? 0}`).join(' ')
        : `🎴 ${handSize(p.resources)}`,
    });
  });
  return tiles;
}

/** What the status line says, in order of precedence: a winner, a setup step, the dice, or who is to roll. */
export type VestaStatus =
  | { kind: 'won'; seat: string }
  | { kind: 'setup'; step: 'road' | 'settlement'; seat: string }
  | { kind: 'dice'; dice: [number, number]; total: number }
  | { kind: 'roll'; seat: string };

export function vestaStatus(
  state: Pick<GameState, 'winner' | 'setupStep' | 'dice'>,
  participants: readonly string[],
  turnSeat: string | null,
  isSetup: boolean,
): VestaStatus {
  if (state.winner !== null && state.winner !== undefined) {
    return { kind: 'won', seat: participants[state.winner] ?? '' };
  }
  if (isSetup) return { kind: 'setup', step: state.setupStep === 'road' ? 'road' : 'settlement', seat: turnSeat ?? '' };
  if (state.dice) return { kind: 'dice', dice: [state.dice[0], state.dice[1]], total: state.dice[0] + state.dice[1] };
  return { kind: 'roll', seat: turnSeat ?? '' };
}
