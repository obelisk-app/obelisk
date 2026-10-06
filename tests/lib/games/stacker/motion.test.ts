import { describe, expect, it } from 'vitest';
import { refillQueue, spawn, tryMove, tryRotate } from '@/lib/games/stacker/motion';
import { createState } from '@/lib/games/stacker/engine';
import { GARBAGE_CELL, WIDTH, type Cell } from '@/lib/games/stacker/board';

describe('stacker motion', () => {
  it('keeps the queue at least seven deep', () => {
    const state = createState(7);
    state.queue = [];
    refillQueue(state);
    expect(state.queue.length).toBeGreaterThanOrEqual(7);
  });

  it('stops at the wall instead of passing through it', () => {
    const state = createState(7);
    let moves = 0;
    while (tryMove(state, -1, 0)) moves++;
    expect(moves).toBeGreaterThan(0);
    expect(tryMove(state, -1, 0)).toBe(false);
  });

  it('a spawn into a full stack ends the game', () => {
    const state = createState(7);
    state.board = state.board.map(() => Array<Cell>(WIDTH).fill(GARBAGE_CELL));
    spawn(state);
    expect(state.dead).toBe(true);
    expect(state.active).toBeNull();
  });

  it('rotates in open space, and a half turn needs no kick', () => {
    const state = createState(7);
    expect(tryRotate(state, 2)).toBe(true);
    expect(tryRotate(state, 1)).toBe(true);
  });
});
