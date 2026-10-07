'use client';

import { useState } from 'react';
import type { GameSession } from '@/lib/games/session/session';
import { useCascadeReveal } from '@/hooks/games/chain-reaction/useCascadeReveal';
import {
  boardSizing,
  boardTurn,
  cellViews,
  isPlayableCell,
  legendEntries,
  readBoard,
} from '@/utils/games/chain-reaction/board-view';

export interface ChainReactionBoardInput {
  game: GameSession;
  mySeats: string[];
  onAction: (action: { cell: number }, seat: string) => Promise<void>;
  maxWidth: number;
  maxHeight?: number;
  seatLabel?: (seatId: string) => string;
  onRevealChange?: (animating: boolean) => void;
}

/**
 * The board's view model: the grid and its sizes, the cells as drawn (with
 * the cascade playing back over them), the legend, and `click`, which drops
 * an orb for the acting seat when the cell is playable and nothing is in
 * flight.
 */
export function useChainReactionBoard({
  game, mySeats, onAction, maxWidth, maxHeight, seatLabel, onRevealChange,
}: ChainReactionBoardInput) {
  const [busy, setBusy] = useState(false);
  const { rows, cols, cells, seats, order, eliminated } = readBoard(game);
  const { boardWidth, orb } = boardSizing(cols, rows, maxWidth, maxHeight);
  const { actingSeatId, mySeat, myTurn, myColor, matrixHex } = boardTurn(game, mySeats, seats);

  const { displayCells, animating, explosions, noteOwnClick } = useCascadeReveal({
    cells,
    seats,
    currentTurn: game.currentTurn,
    rows,
    cols,
    mySeats,
    onRevealChange,
  });

  const click = async (i: number) => {
    if (busy || animating || !myTurn || mySeat === null || !actingSeatId) return;
    if (!isPlayableCell(cells[i], mySeat)) return;
    noteOwnClick(i);
    setBusy(true);
    try {
      await onAction({ cell: i }, actingSeatId);
    } finally {
      setBusy(false);
    }
  };

  return {
    cols,
    boardWidth,
    orb,
    matrixHex,
    myColor,
    cells: cellViews(displayCells, explosions, myTurn && !busy && !animating, mySeat),
    legend: legendEntries(order, game, mySeats, eliminated, seatLabel),
    click,
  };
}
