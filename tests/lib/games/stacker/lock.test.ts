import { describe, expect, it } from 'vitest';
import { lockPiece } from '@/lib/games/stacker/lock';
import { createState } from '@/lib/games/stacker/engine';
import { TOTAL_HEIGHT, WIDTH, type Cell } from '@/lib/games/stacker/board';

/** A bottom row full except for the columns the I piece will drop into. */
function nearlyFullBottom(state: ReturnType<typeof createState>, gap: number[]) {
  const row = Array<Cell>(WIDTH).fill(8);
  for (const x of gap) row[x] = 0;
  state.board[TOTAL_HEIGHT - 1] = row;
}

describe('stacker lock', () => {
  it('a piece that clears nothing lets queued garbage in and resets the combo', () => {
    const state = createState(7);
    state.combo = 3;
    state.incoming = [{ lines: 2, hole: 0 }];
    while (state.active && state.active.y < 2) state.active = { ...state.active, y: state.active.y + 1 };
    lockPiece(state, false);
    expect(state.combo).toBe(0);
    expect(state.incoming).toEqual([]);
    expect(state.board[TOTAL_HEIGHT - 1][0]).toBe(0);
    expect(state.board[TOTAL_HEIGHT - 1][1]).not.toBe(0);
  });

  it('a clear sends attack that first cancels incoming garbage', () => {
    const state = createState(7);
    state.active = { kind: 'I', x: 3, y: TOTAL_HEIGHT - 2, rotation: 0 };
    nearlyFullBottom(state, [3, 4, 5, 6]);
    state.combo = 5;
    state.incoming = [{ lines: 50, hole: 1 }];
    lockPiece(state, false);
    expect(state.linesCleared).toBe(1);
    expect(state.clears).toHaveLength(1);
    expect(state.incoming[0].lines).toBe(50 - state.clears[0].attack);
  });
});
