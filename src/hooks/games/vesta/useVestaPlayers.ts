'use client';

import type { GameState } from 'vesta';
import type { VestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { playerTiles, vestaStatus } from '@/utils/games/vesta/vesta-players';

/** The seat tiles and the status line under them. */
export function useVestaPlayers({ state, mySeats, turn }: {
  state: GameState;
  mySeats: string[];
  turn: Pick<VestaTurn, 'participants' | 'turnIdx' | 'turnSeat' | 'isSetup'>;
}) {
  const { participants, turnIdx, turnSeat, isSetup } = turn;
  return {
    tiles: playerTiles(participants, state.players, turnIdx, mySeats),
    status: vestaStatus(state, participants, turnSeat, isSetup),
  };
}
