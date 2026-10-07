import { describe, expect, it } from 'vitest';
import { createState, encodeBoard, HEIGHT, WIDTH } from '@/lib/games/stacker/engine';
import { miniBoardRects, miniBoardSize } from '@/utils/games/stacker/mini-board-rects';

const COLORS = { 1: '#111', 2: '#222' };

describe('miniBoardSize', () => {
  it('is the well at the given cell size', () => {
    expect(miniBoardSize(6)).toEqual({ width: WIDTH * 6, height: HEIGHT * 6 });
  });
});

describe('miniBoardRects', () => {
  it('paints the background and a half-transparent height bar before any snapshot', () => {
    expect(miniBoardRects(null, 3, false, 5, COLORS)).toEqual([
      { x: 0, y: 0, w: 50, h: 100, color: '#08080a', alpha: 1 },
      { x: 0, y: 85, w: 50, h: 15, color: '#b4f953', alpha: 0.5 },
    ]);
  });

  it('caps the bar at the well, greys it and veils a player who is out', () => {
    const rects = miniBoardRects(null, 50, true, 5, COLORS);
    expect(rects[1]).toEqual({ x: 0, y: 0, w: 50, h: 100, color: '#3f3f46', alpha: 0.5 });
    expect(rects[2]).toEqual({ x: 0, y: 0, w: 50, h: 100, color: 'rgba(0,0,0,0.55)', alpha: 1 });
  });

  it('paints one inset square per filled cell, in its palette colour or grey for an unknown value', () => {
    const state = createState(1);
    const bottom = state.board[state.board.length - 1];
    bottom[0] = 1;
    bottom[2] = 2;
    bottom[4] = 5;
    const rects = miniBoardRects(encodeBoard(state), 1, false, 4, COLORS).slice(1);
    const y = (HEIGHT - 1) * 4;
    expect(rects).toEqual([
      { x: 0, y, w: 3.5, h: 3.5, color: '#111', alpha: 1 },
      { x: 8, y, w: 3.5, h: 3.5, color: '#222', alpha: 1 },
      { x: 16, y, w: 3.5, h: 3.5, color: '#888', alpha: 1 },
    ]);
  });

  it('falls back to the bar when the snapshot does not decode', () => {
    expect(miniBoardRects('nonsense', 2, false, 5, COLORS)[1].alpha).toBe(0.5);
  });
});
