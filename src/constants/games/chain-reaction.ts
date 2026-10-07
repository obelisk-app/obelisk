/**
 * Games: chain reaction. Values the code in
 * `utils/games/chain-reaction/board-view.ts` reads, kept here so every reader
 * imports the one copy.
 */

/**
 * Seat colours, picked to stay apart from each other on a near-black board.
 *
 * The first four are the ones most games actually use, so they are the most
 * separated: warm red, the brand lime, a cold cyan, and amber. Nothing sits
 * next to its neighbour in hue, and every one is bright enough to read as a
 * glowing orb rather than a dark dot.
 */
export const SEAT_COLORS = [
  { hex: '#ff4d5e', dot: 'bg-red-500' },     // red
  { hex: '#b4f953', dot: 'bg-lc-green' },    // lime (brand)
  { hex: '#38bdf8', dot: 'bg-sky-400' },     // sky
  { hex: '#fbbf24', dot: 'bg-amber-400' },   // amber
  { hex: '#c084fc', dot: 'bg-purple-400' },  // violet
  { hex: '#f472b6', dot: 'bg-pink-400' },    // pink
  { hex: '#fb923c', dot: 'bg-orange-400' },  // orange
  { hex: '#2dd4bf', dot: 'bg-teal-400' },    // teal
];

/** Cell size for an inline board: the size this game has always been. */
export const CELL_DEFAULT_MAX = 44;

/** Ceiling when the board is given a height to fill. Past this it reads as a toy. */
export const CELL_FULLSCREEN_MAX = 92;

/** Orb diameter as a share of the cell, so the pieces grow with the board. */
export const ORB_RATIO = 0.23;

/** The matrix colour when nobody is on move: waiting or finished. */
export const NEUTRAL_MATRIX_HEX = '#3f3f46';
