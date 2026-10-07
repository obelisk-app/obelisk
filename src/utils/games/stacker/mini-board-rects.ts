/**
 * What an opponent's mini well paints, as a list of filled rectangles in
 * order: the background, then either one square per filled cell of their
 * last snapshot or, before any snapshot, a bar for how buried they are, then
 * a veil over a player who is out. The hook paints them; this only decides.
 */
import { decodeBoard, HEIGHT, WIDTH } from '@/lib/games/stacker/engine';

export interface PaintRect { x: number; y: number; w: number; h: number; color: string; alpha: number }

const BACKGROUND = '#08080a';
const DEAD_CELL = '#3f3f46';
const HEIGHT_BAR = '#b4f953';
const UNKNOWN_CELL = '#888';
const DEAD_VEIL = 'rgba(0,0,0,0.55)';

/** The well's size in CSS pixels at `cell` pixels a cell. */
export function miniBoardSize(cell: number): { width: number; height: number } {
  return { width: WIDTH * cell, height: HEIGHT * cell };
}

export function miniBoardRects(
  board: string | null,
  height: number,
  dead: boolean,
  cell: number,
  colors: Readonly<Record<number, string>>,
): PaintRect[] {
  const { width: w, height: h } = miniBoardSize(cell);
  const rects: PaintRect[] = [{ x: 0, y: 0, w, h, color: BACKGROUND, alpha: 1 }];

  const rows = board ? decodeBoard(board) : null;
  if (rows) {
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const value = rows[y][x];
        if (!value) continue;
        rects.push({
          x: x * cell, y: y * cell, w: cell - 0.5, h: cell - 0.5,
          color: dead ? DEAD_CELL : (colors[value] ?? UNKNOWN_CELL),
          alpha: 1,
        });
      }
    }
  } else {
    // No snapshot yet: fall back to a bar for how buried they are.
    const filled = Math.min(HEIGHT, height);
    rects.push({ x: 0, y: h - filled * cell, w, h: filled * cell, color: dead ? DEAD_CELL : HEIGHT_BAR, alpha: 0.5 });
  }

  if (dead) rects.push({ x: 0, y: 0, w, h, color: DEAD_VEIL, alpha: 1 });
  return rects;
}
