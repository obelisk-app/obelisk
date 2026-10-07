/**
 * The Chain Reaction board as the markup draws it: the grid read from the
 * session (with an empty 6×9 for a table that has not started), the cell and
 * orb sizes for the room it was given, whose turn it is from this client's
 * seats, and one view per cell and per legend entry.
 */
import type { GameSession } from '@/lib/games/session/session';
import type { CRState } from '@/lib/games/chain-reaction/chain-reaction';
import { SEAT_COLORS } from '@/components/games/chain-reaction/seat-colors';
import type { CellSnapshot } from '@/components/games/chain-reaction/cascade';

/** Cell size for an inline board: the size this game has always been. */
export const CELL_DEFAULT_MAX = 44;
/** Ceiling when the board is given a height to fill. Past this it reads as a toy. */
export const CELL_FULLSCREEN_MAX = 92;
/** Orb diameter as a share of the cell, so the pieces grow with the board. */
export const ORB_RATIO = 0.23;
/** The matrix colour when nobody is on move: waiting or finished. */
export const NEUTRAL_MATRIX_HEX = '#3f3f46';

export interface BoardGrid {
  rows: number;
  cols: number;
  cells: CellSnapshot[];
  seats: Record<string, number>;
  order: string[];
  eliminated: string[];
}

/** One empty grid per size, so a table with no state yet hands the same array to every render. */
const EMPTY_GRIDS = new Map<string, CellSnapshot[]>();

/** The empty `rows` by `cols` grid, the same array on every call for a size. */
export function emptyGrid(rows: number, cols: number): CellSnapshot[] {
  const key = `${rows}x${cols}`;
  let grid = EMPTY_GRIDS.get(key);
  if (!grid) {
    grid = Array.from({ length: rows * cols }, () => ({ count: 0, owner: null }));
    EMPTY_GRIDS.set(key, grid);
  }
  return grid;
}

/** The board out of the session state, with an empty default grid. */
export function readBoard(game: GameSession): BoardGrid {
  const state = (game.state ?? {}) as Partial<CRState>;
  const rows: number = state.rows ?? 9;
  const cols: number = state.cols ?? 6;
  return {
    rows,
    cols,
    cells: state.cells ?? emptyGrid(rows, cols),
    seats: state.seats ?? {},
    order: state.order ?? [],
    eliminated: state.eliminated ?? [],
  };
}

/**
 * Fit the board to whatever room it was given, in both directions. Without a
 * height the cell keeps the inline size this game has always used.
 */
export function boardSizing(cols: number, rows: number, maxWidth: number, maxHeight?: number) {
  const cellCap = maxHeight ? CELL_FULLSCREEN_MAX : CELL_DEFAULT_MAX;
  const cellPx = Math.max(
    16,
    Math.floor(Math.min(maxWidth / cols, maxHeight ? maxHeight / rows : cellCap, cellCap)),
  );
  return {
    cellPx,
    boardWidth: cellPx * cols,
    orb: Math.round(Math.max(8, Math.min(cellPx * ORB_RATIO, 24))),
  };
}

/**
 * Whose board this is right now. The acting seat is the one on move if we
 * hold it, otherwise our only seat (so a spectator-ish view still colours the
 * right player). The grid wears the colour of whoever is on move, so the
 * matrix visibly changes hue every turn.
 */
export function boardTurn(game: GameSession, mySeats: readonly string[], seats: Record<string, number>) {
  const actingSeatId = game.currentTurn && mySeats.includes(game.currentTurn)
    ? game.currentTurn
    : mySeats.length === 1 ? mySeats[0] : null;
  const mySeat = actingSeatId !== null ? seats[actingSeatId] ?? null : null;
  const myTurn = game.status === 'in_progress'
    && !!game.currentTurn
    && mySeats.includes(game.currentTurn);
  const turnSeat = game.currentTurn ? seats[game.currentTurn] : undefined;
  const turnHex = typeof turnSeat === 'number' ? SEAT_COLORS[turnSeat]?.hex : undefined;
  return {
    actingSeatId,
    mySeat,
    myTurn,
    myColor: mySeat !== null && mySeat >= 0 ? SEAT_COLORS[mySeat] : null,
    matrixHex: turnHex ?? NEUTRAL_MATRIX_HEX,
  };
}

/** A cell this seat may drop an orb on: empty, or already its own. */
export function isPlayableCell(cell: CellSnapshot, mySeat: number | null): boolean {
  return cell.owner === null || cell.owner === mySeat;
}

export interface CellView {
  count: number;
  /** The owner's colour, or null for an empty cell. */
  hex: string | null;
  canClick: boolean;
  burst: { id: number; hex: string } | undefined;
}

/** One view per drawn cell: its colour, whether it can be played, and its burst. */
export function cellViews(
  cells: readonly CellSnapshot[],
  explosions: Readonly<Record<number, { id: number; hex: string } | undefined>>,
  open: boolean,
  mySeat: number | null,
): CellView[] {
  return cells.map((cell, i) => ({
    count: cell.count,
    hex: cell.owner !== null ? SEAT_COLORS[cell.owner]?.hex ?? null : null,
    canClick: open && isPlayableCell(cell, mySeat),
    burst: explosions[i],
  }));
}

export interface LegendEntry {
  pubkey: string;
  dot: string;
  label: string;
  isMe: boolean;
  out: boolean;
  turn: boolean;
}

/** The seat legend under the board, in seat order. */
export function legendEntries(
  order: readonly string[],
  game: GameSession,
  mySeats: readonly string[],
  eliminated: readonly string[],
  seatLabel?: (seatId: string) => string,
): LegendEntry[] {
  return order.map((pubkey, seat) => ({
    pubkey,
    dot: SEAT_COLORS[seat].dot,
    label: seatLabel ? seatLabel(pubkey) : pubkey.slice(0, 6),
    isMe: mySeats.includes(pubkey),
    out: eliminated.includes(pubkey),
    turn: game.currentTurn === pubkey,
  }));
}
