import { describe, expect, it } from 'vitest';
import {
  boardChanged,
  cascadeFrames,
  cellsRoughlyEqual,
  findClickedCell,
  matchScore,
  neighborIndices,
  oneCascadeRound,
  simulateFull,
  type CellSnapshot,
} from '@/utils/games/chain-reaction/cascade';

const empty = (n: number): CellSnapshot[] => Array.from({ length: n }, () => ({ count: 0, owner: null }));

describe('neighborIndices', () => {
  it('gives a corner two neighbours, an edge three and the middle four', () => {
    expect(neighborIndices(3, 3, 0).sort()).toEqual([1, 3]);
    expect(neighborIndices(3, 3, 1).sort()).toEqual([0, 2, 4]);
    expect(neighborIndices(3, 3, 4).sort()).toEqual([1, 3, 5, 7]);
  });
});

describe('oneCascadeRound', () => {
  it('returns null when nothing is critical', () => {
    expect(oneCascadeRound(empty(9), 3, 3, 0)).toBeNull();
  });

  it('splits a critical corner into its neighbours, taking them for the mover', () => {
    const cells = empty(9);
    cells[0] = { count: 2, owner: 0 };
    cells[1] = { count: 1, owner: 1 };
    const step = oneCascadeRound(cells, 3, 3, 0)!;
    expect(step.exploded).toEqual([0]);
    expect(step.cells[0]).toEqual({ count: 0, owner: null });
    expect(step.cells[1]).toEqual({ count: 2, owner: 0 });
    expect(step.cells[3]).toEqual({ count: 1, owner: 0 });
  });
});

describe('cascadeFrames and simulateFull', () => {
  it('starts with the placed orb and ends where the full simulation ends', () => {
    const prev = empty(9);
    prev[0] = { count: 1, owner: 0 };
    const frames = cascadeFrames(prev, 3, 3, 0, 0);
    expect(frames[0].cells[0]).toEqual({ count: 2, owner: 0 });
    expect(frames[0].exploded).toEqual([]);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames[frames.length - 1].cells).toEqual(simulateFull(prev, 3, 3, 0, 0));
  });

  it('is a single frame when the click does not burst anything', () => {
    expect(cascadeFrames(empty(9), 3, 3, 0, 4)).toHaveLength(1);
  });
});

describe('findClickedCell', () => {
  it('reconstructs a remote click from the before and after boards', () => {
    const prev = empty(9);
    prev[8] = { count: 1, owner: 1 };
    const next = simulateFull(prev, 3, 3, 1, 8);
    expect(findClickedCell(prev, next, 3, 3, 1)).toBe(8);
  });

  it('never picks a cell owned by someone else', () => {
    const prev = empty(4);
    prev[0] = { count: 1, owner: 0 };
    prev[1] = { count: 1, owner: 0 };
    prev[2] = { count: 1, owner: 0 };
    prev[3] = { count: 1, owner: 0 };
    expect(findClickedCell(prev, prev, 2, 2, 1)).toBe(-1);
  });
});

describe('board comparisons', () => {
  it('compares exactly, scores closeness and spots a change', () => {
    const a = empty(4);
    const b = empty(4);
    b[2] = { count: 1, owner: 0 };
    expect(cellsRoughlyEqual(a, a)).toBe(true);
    expect(cellsRoughlyEqual(a, b)).toBe(false);
    expect(cellsRoughlyEqual(a, empty(3))).toBe(false);
    expect(matchScore(a, a)).toBe(8);
    expect(matchScore(a, b)).toBe(6);
    expect(boardChanged(a, a)).toBe(false);
    expect(boardChanged(a, b)).toBe(true);
  });
});
