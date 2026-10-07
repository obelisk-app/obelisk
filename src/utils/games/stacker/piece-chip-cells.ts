/**
 * A piece laid out for a miniature chip (the next queue, the hold slot): its
 * four cells centred in a 4 x 2 box, in cell units, each with which of its
 * sides touch another cell of the same piece so the painter can join them.
 */
import { cellsOf, PIECES, type PieceKind } from '@/lib/games/stacker/engine';
import { CHIP_COLUMNS, CHIP_ROWS } from '@/constants/games/stacker';

export interface ChipCell {
  x: number;
  y: number;
  joined: { up: boolean; down: boolean; left: boolean; right: boolean };
}

/** The piece's colour from a palette indexed like the board (1-based piece order). */
export function pieceColor(kind: PieceKind, colors: Readonly<Record<number, string>>): string {
  return colors[PIECES.indexOf(kind) + 1] ?? '#fff';
}

export function pieceChipCells(kind: PieceKind): ChipCell[] {
  const cells = cellsOf({ kind, x: 0, y: 0, rotation: 0 });
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const offsetX = (CHIP_COLUMNS - (Math.max(...xs) - Math.min(...xs) + 1)) / 2 - Math.min(...xs);
  const offsetY = (CHIP_ROWS - (Math.max(...ys) - Math.min(...ys) + 1)) / 2 - Math.min(...ys);
  const member = new Set(cells.map(([x, y]) => `${x},${y}`));
  return cells.map(([x, y]) => ({
    x: x + offsetX,
    y: y + offsetY,
    joined: {
      up: member.has(`${x},${y - 1}`),
      down: member.has(`${x},${y + 1}`),
      left: member.has(`${x - 1},${y}`),
      right: member.has(`${x + 1},${y}`),
    },
  }));
}
