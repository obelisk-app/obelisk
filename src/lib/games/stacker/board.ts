/**
 * The well: its dimensions, the cell alphabet, collision, and the compact
 * encoding opponents' boards cross the relay in.
 */
import { cellsOf, type ActivePiece } from './pieces';
import {
  BUFFER,
  GARBAGE_CELL,
  HEIGHT,
  MAX_GARBAGE_LINES,
  TOTAL_HEIGHT,
  WIDTH,
  type Cell,
} from './dimensions';

export { BUFFER, GARBAGE_CELL, HEIGHT, MAX_GARBAGE_LINES, TOTAL_HEIGHT, WIDTH, type Cell };

export function emptyBoard(): Cell[][] {
  return Array.from({ length: TOTAL_HEIGHT }, () => Array<Cell>(WIDTH).fill(0));
}

export function collides(board: Cell[][], piece: ActivePiece): boolean {
  for (const [x, y] of cellsOf(piece)) {
    if (x < 0 || x >= WIDTH || y >= TOTAL_HEIGHT) return true;
    if (y < 0) continue;
    if (board[y][x] !== 0) return true;
  }
  return false;
}

/** Height of the tallest column, for the danger meter and mini-boards. */
export function stackHeightOf(board: Cell[][]): number {
  for (let y = 0; y < TOTAL_HEIGHT; y++) {
    if (board[y].some((c) => c !== 0)) return TOTAL_HEIGHT - y;
  }
  return 0;
}

/**
 * Pack the visible board into a short string.
 *
 * Opponents' boards have to cross the relay often enough to be worth looking
 * at, so they cannot be JSON. Each cell is one hex digit (0 empty, 1-7 piece,
 * 8 garbage), which makes the whole visible well 200 characters, small enough
 * to publish every few seconds without flooding anybody.
 */
export function packBoard(board: Cell[][]): string {
  let out = '';
  for (let y = BUFFER; y < TOTAL_HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      out += (board[y][x] & 0xf).toString(16);
    }
  }
  return out;
}

/** Unpack `packBoard` back into visible rows. Returns null on nonsense. */
export function decodeBoard(encoded: string): Cell[][] | null {
  if (encoded.length !== HEIGHT * WIDTH) return null;
  const rows: Cell[][] = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < WIDTH; x++) {
      const value = parseInt(encoded[y * WIDTH + x], 16);
      if (Number.isNaN(value)) return null;
      row.push(value);
    }
    rows.push(row);
  }
  return rows;
}
