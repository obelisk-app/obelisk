/**
 * The Stacker hero's two wells (`src/assets/illustrations/guides/heroes/StackerHero.tsx`
 * and `StackerWell.tsx`): the grid's size, the blocks already in each well,
 * and where every block and garbage cell is drawn. The arithmetic is the
 * hero's own, so its still frame under `public/og/guides/` does not change.
 */

import { STACKER_PIECES, STACKER_CELL, STACKER_COLS, STACKER_TOP } from '@/constants/guides/stacker-art';

const GARBAGE = '#4b5563';
/** The column a garbage row leaves open: the attack's `hole`. */
const HOLE = 6;

export type Block = [col: number, row: number, color: string];

/** One row of blocks at row `r`, coloured through the pieces from `offset`. */
export function stackerRow(r: number, cols: number[], offset = 0): Block[] {
  return cols.map((c, i) => [c, r, STACKER_PIECES[(i + offset) % STACKER_PIECES.length]] as Block);
}

/** The left well, one full row from a clear. */
export const STACKER_LEFT: Block[] = [
  ...stackerRow(8, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2),
  ...stackerRow(7, [0, 1, 2, 4, 5, 7, 9], 5),
  ...stackerRow(6, [0, 4, 5, 9], 1),
  ...stackerRow(5, [5], 3),
];

/** The right well, already digging out of what somebody sent it. */
export const STACKER_RIGHT: Block[] = [
  ...stackerRow(5, [1, 2, 6, 7], 4),
  ...stackerRow(4, [1, 6], 0),
];

/** A cell's square inside the well whose left edge is `x`. */
function cellAt(x: number, c: number, r: number) {
  return { x: x + c * STACKER_CELL + 1, y: STACKER_TOP + r * STACKER_CELL + 1 };
}

/** The blocks of a well at `x`, placed. */
export function wellBlocks(x: number, blocks: readonly Block[]) {
  return blocks.map(([c, r, color], i) => ({ key: i, ...cellAt(x, c, r), fill: color }));
}

/** The grey garbage rows a well at `x` received, every cell but the hole. */
export function wellGarbage(x: number, rows: readonly number[] = []) {
  return rows.flatMap((r) =>
    Array.from({ length: STACKER_COLS }, (_, c) => c)
      .filter((c) => c !== HOLE)
      .map((c) => ({ key: `g${r}-${c}`, ...cellAt(x, c, r), fill: GARBAGE })),
  );
}
