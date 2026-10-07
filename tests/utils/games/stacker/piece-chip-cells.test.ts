import { describe, expect, it } from 'vitest';
import { pieceChipCells, pieceColor } from '@/utils/games/stacker/piece-chip-cells';

describe('pieceColor', () => {
  it('reads the palette in piece order, white when missing', () => {
    expect(pieceColor('I', { 1: '#i' })).toBe('#i');
    expect(pieceColor('T', { 6: '#t' })).toBe('#t');
    expect(pieceColor('Z', {})).toBe('#fff');
  });
});

describe('pieceChipCells', () => {
  it('centres every piece inside the 4 x 2 chip', () => {
    for (const kind of ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const) {
      const cells = pieceChipCells(kind);
      expect(cells).toHaveLength(4);
      const xs = cells.map((c) => c.x);
      const ys = cells.map((c) => c.y);
      expect(Math.min(...xs) + Math.max(...xs) + 1).toBeCloseTo(4);
      expect(Math.min(...ys) + Math.max(...ys) + 1).toBeCloseTo(2);
    }
  });

  it('lays an I flat across the chip, joined end to end', () => {
    const cells = pieceChipCells('I').sort((a, b) => a.x - b.x);
    expect(cells.map((c) => c.x)).toEqual([0, 1, 2, 3]);
    expect(cells.every((c) => c.y === 0.5)).toBe(true);
    expect(cells.map((c) => [c.joined.left, c.joined.right])).toEqual([[false, true], [true, true], [true, true], [true, false]]);
    expect(cells.every((c) => !c.joined.up && !c.joined.down)).toBe(true);
  });

  it('joins an O on all its inner sides', () => {
    const cells = pieceChipCells('O');
    expect(cells.map((c) => Object.values(c.joined).filter(Boolean).length)).toEqual([2, 2, 2, 2]);
    expect(cells.map((c) => c.x).sort()).toEqual([1, 1, 2, 2]);
  });
});
