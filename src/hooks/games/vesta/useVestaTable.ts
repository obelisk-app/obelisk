'use client';

import type { GameState, HexCoord } from 'vesta';
import type { GameSession } from '@/lib/games/session/session';
import type { VestaAction } from '@/lib/games/vesta/definition';
import type { EdgePick, VertexPick } from '@/utils/games/vesta/board-pick';
import { useVestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { roadAction, robberAction, vertexAction } from '@/utils/games/vesta/vesta-actions';

export interface VestaTableInput {
  session: GameSession;
  state: GameState;
  /** Seats this account may act for. Several means hot-seat on this machine. */
  mySeats: string[];
  onAction: (action: VestaAction, seat: string) => Promise<void>;
}

/**
 * The Vesta table's view model: the turn (see `useVestaTurn`), what a click
 * on the board sends, and whether to say who the table is waiting for.
 */
export function useVestaTable({ session, state, mySeats, onAction }: VestaTableInput) {
  const turn = useVestaTurn({ session, state, mySeats, onAction });
  const { mode, send, myTurn, turnSeat } = turn;
  return {
    turn,
    pickVertex: (spot: VertexPick) => void send(vertexAction(mode, spot)),
    pickEdge: (edge: EdgePick) => void send(roadAction(edge)),
    pickHex: (hex: HexCoord) => void send(robberAction(hex)),
    waiting: !myTurn && state.winner === null,
    waitingFor: turnSeat ?? '',
  };
}
