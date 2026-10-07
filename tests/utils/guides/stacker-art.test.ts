import { describe, expect, it } from 'vitest';
import {
  STACKER_LEFT,
  stackerRow,
  wellBlocks,
  wellGarbage,
} from '@/utils/guides/stacker-art';
import { STACKER_CELL, STACKER_COLS, STACKER_PIECES, STACKER_TOP } from '@/constants/guides/stacker-art';

describe('stacker hero wells', () => {
  it('colours a row by cycling the pieces from its offset', () => {
    const row = stackerRow(3, [0, 1], STACKER_PIECES.length - 1);
    expect(row).toEqual([[0, 3, STACKER_PIECES[STACKER_PIECES.length - 1]], [1, 3, STACKER_PIECES[0]]]);
  });

  it('leaves the left well one full row from a clear', () => {
    expect(STACKER_LEFT.filter(([, r]) => r === 8)).toHaveLength(STACKER_COLS);
  });

  it('places a block inside its grid square, one pixel in', () => {
    expect(wellBlocks(96, [[2, 4, '#fff']])).toEqual([
      { key: 0, x: 96 + 2 * STACKER_CELL + 1, y: STACKER_TOP + 4 * STACKER_CELL + 1, fill: '#fff' },
    ]);
  });

  it('fills every garbage row except the hole the attack named', () => {
    const cells = wellGarbage(484, [6, 7]);
    expect(cells).toHaveLength(2 * (STACKER_COLS - 1));
    expect(cells.some((c) => c.key === 'g6-6')).toBe(false);
    expect(wellGarbage(484)).toEqual([]);
  });
});
