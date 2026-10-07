import { describe, expect, it } from 'vitest';
import type { GameSession } from '@/lib/games/session/session';
import { SEAT_COLORS } from '@/utils/games/chain-reaction/seat-colors';
import {
  boardSizing,
  boardTurn,
  cellViews,
  isPlayableCell,
  legendEntries,
  NEUTRAL_MATRIX_HEX,
  readBoard,
} from '@/utils/games/chain-reaction/board-view';

function game(over: Partial<GameSession>): GameSession {
  return { status: 'in_progress', currentTurn: null, state: null, ...over } as unknown as GameSession;
}

describe('readBoard', () => {
  it('reads the grid off the session', () => {
    const cells = [{ count: 1, owner: 0 }, { count: 0, owner: null }];
    const board = readBoard(game({ state: { rows: 1, cols: 2, cells, seats: { a: 0 }, order: ['a'], eliminated: ['b'] } }));
    expect(board).toEqual({ rows: 1, cols: 2, cells, seats: { a: 0 }, order: ['a'], eliminated: ['b'] });
  });

  it('draws an empty 6×9 board for a table with no state yet', () => {
    const board = readBoard(game({}));
    expect(board.cols).toBe(6);
    expect(board.rows).toBe(9);
    expect(board.cells).toHaveLength(54);
    expect(board.cells.every((c) => c.count === 0 && c.owner === null)).toBe(true);
    expect(board).toMatchObject({ seats: {}, order: [], eliminated: [] });
  });

  it('hands every render the same empty grid while there is no state, so the board can settle', () => {
    expect(readBoard(game({})).cells).toBe(readBoard(game({})).cells);
  });
});

describe('boardSizing', () => {
  it('keeps the inline cell cap when only a width is given', () => {
    expect(boardSizing(5, 7, 420)).toEqual({ cellPx: 44, boardWidth: 220, orb: 10 });
  });

  it('grows to the fullscreen cap when a height is given too', () => {
    expect(boardSizing(5, 7, 1408, 690).boardWidth).toBe(460);
  });

  it('fits the shorter dimension', () => {
    expect(boardSizing(5, 7, 1408, 280).cellPx).toBe(40);
  });

  it('never draws a cell under 16px or an orb outside 8..24px', () => {
    expect(boardSizing(50, 7, 100)).toMatchObject({ cellPx: 16, orb: 8 });
    expect(boardSizing(1, 1, 5000, 5000).orb).toBe(21);
  });
});

describe('boardTurn', () => {
  const seats = { a: 0, b: 1 };

  it('acts as the seat on move when this client holds it, in its colour', () => {
    const turn = boardTurn(game({ currentTurn: 'b' }), ['a', 'b'], seats);
    expect(turn).toMatchObject({ actingSeatId: 'b', mySeat: 1, myTurn: true, myColor: SEAT_COLORS[1] });
    expect(turn.matrixHex).toBe(SEAT_COLORS[1].hex);
  });

  it('falls back to the only seat held when it is somebody else\'s move', () => {
    expect(boardTurn(game({ currentTurn: 'b' }), ['a'], seats)).toMatchObject({ actingSeatId: 'a', mySeat: 0, myTurn: false });
  });

  it('has no acting seat for a spectator, and a neutral matrix with nobody on move', () => {
    expect(boardTurn(game({ currentTurn: 'a' }), [], seats)).toMatchObject({ actingSeatId: null, mySeat: null, myColor: null });
    expect(boardTurn(game({ status: 'finished' }), ['a'], seats)).toMatchObject({ myTurn: false, matrixHex: NEUTRAL_MATRIX_HEX });
  });
});

describe('cells and legend', () => {
  it('lets a seat play empty cells and its own, never an opponent\'s', () => {
    expect(isPlayableCell({ count: 0, owner: null }, 0)).toBe(true);
    expect(isPlayableCell({ count: 2, owner: 0 }, 0)).toBe(true);
    expect(isPlayableCell({ count: 1, owner: 1 }, 0)).toBe(false);
  });

  it('colours each cell by owner and marks only playable ones while open', () => {
    const burst = { id: 7, hex: '#fff' };
    const views = cellViews([{ count: 0, owner: null }, { count: 2, owner: 1 }], { 1: burst }, true, 0);
    expect(views).toEqual([
      { count: 0, hex: null, canClick: true, burst: undefined },
      { count: 2, hex: SEAT_COLORS[1].hex, canClick: false, burst },
    ]);
    expect(cellViews([{ count: 0, owner: null }], {}, false, 0)[0].canClick).toBe(false);
  });

  it('lists every seat with its dot, who is on move, who is out and which are the viewer\'s', () => {
    const entries = legendEntries(['pk-ana', 'pk-bruno'], game({ currentTurn: 'pk-bruno' }), ['pk-ana'], ['pk-bruno']);
    expect(entries).toEqual([
      { pubkey: 'pk-ana', dot: SEAT_COLORS[0].dot, label: 'pk-ana', isMe: true, out: false, turn: false },
      { pubkey: 'pk-bruno', dot: SEAT_COLORS[1].dot, label: 'pk-bru', isMe: false, out: true, turn: true },
    ]);
    expect(legendEntries(['pk-ana'], game({}), [], [], (s) => s.toUpperCase())[0].label).toBe('PK-ANA');
  });
});
