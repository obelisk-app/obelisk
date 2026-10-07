import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCascadeReveal } from '@/hooks/games/chain-reaction/useCascadeReveal';
import type { CellSnapshot } from '@/utils/games/chain-reaction/cascade';

const grid = (): CellSnapshot[] => Array.from({ length: 4 }, () => ({ count: 0, owner: null }));

describe('useCascadeReveal', () => {
  it('keeps its state when handed a rebuilt board with the same cells and no seated mover', () => {
    const props = { cells: grid(), seats: {}, currentTurn: 'a', rows: 2, cols: 2, mySeats: ['a'] };
    const { result, rerender } = renderHook((p: typeof props) => useCascadeReveal(p), { initialProps: props });
    const first = result.current.displayCells;
    rerender({ ...props, cells: grid() });
    rerender({ ...props, cells: grid() });
    expect(result.current.displayCells).toBe(first);
    expect(result.current.animating).toBe(false);
  });

  it('still shows a board whose cells did change', () => {
    const props = { cells: grid(), seats: {}, currentTurn: 'a', rows: 2, cols: 2, mySeats: ['a'] };
    const { result, rerender } = renderHook((p: typeof props) => useCascadeReveal(p), { initialProps: props });
    const next = grid();
    next[0] = { count: 1, owner: 0 };
    rerender({ ...props, cells: next });
    expect(result.current.displayCells).toBe(next);
  });
});
