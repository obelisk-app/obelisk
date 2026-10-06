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
