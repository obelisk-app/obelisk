/**
 * Geometry for the game picker's thumbnails: fixed mid-game snapshots drawn
 * in each board's own colours, so the picker shows what you are about to get
 * rather than a generic icon.
 */

/** Chain Reaction: [cellIndex, orbCount, colorIdx] on a 4×5 grid. */
const CR_STAMPS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 0], [2, 2, 1], [3, 1, 1],
  [5, 3, 0], [6, 1, 2],
  [9, 2, 2], [10, 1, 0],
  [13, 1, 1], [14, 2, 3],
  [17, 1, 3], [18, 1, 0],
];
const CR_PALETTE = ['#ef4444', '#b4f953', '#60a5fa', '#facc15'];
const CR_COLS = 4;
const CR_ROWS = 5;
const CR_GAP = 1.5;

export interface PreviewCell {
  x: number;
  y: number;
  /** The orbs stamped on this cell, or null for an empty one. */
  orbs: { count: number; color: string } | null;
}

/** The Chain Reaction thumbnail: the cell size and every cell with its orbs. */
export function chainReactionPreview(size: number): { cell: number; cells: PreviewCell[] } {
  const cell = (size - CR_GAP * (CR_COLS - 1)) / CR_COLS;
  const cells = Array.from({ length: CR_COLS * CR_ROWS }, (_, i) => {
    const stamp = CR_STAMPS.find(([idx]) => idx === i);
    return {
      x: (i % CR_COLS) * (cell + CR_GAP),
      y: Math.floor(i / CR_COLS) * (cell + CR_GAP),
      orbs: stamp ? { count: stamp[1], color: CR_PALETTE[stamp[2]] } : null,
    };
  });
  return { cell, cells };
}

/** One, two or three orbs centred in a cell, as circles. */
export function orbCircles(x: number, y: number, cell: number, count: number): Array<{ cx: number; cy: number; r: number }> {
  const cx = x + cell / 2;
  const cy = y + cell / 2;
  const r = cell * 0.16;
  const offsets: Array<[number, number]> =
    count === 1 ? [[0, 0]]
    : count === 2 ? [[-r, 0], [r, 0]]
    : [[-r, r * 0.7], [r, r * 0.7], [0, -r]];
  return offsets.map(([dx, dy]) => ({ cx: cx + dx, cy: cy + dy, r }));
}

/** The six corners of a pointy-top hex of radius `r` centred on (cx, cy), as an SVG points list. */
export function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 90);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

/**
 * The Vesta thumbnail: seven hexes in a flower, in the board's own resource
 * colours, with a road and two settlements on the vertices between them, in
 * two players' colours.
 */
export function vestaPreview(size: number) {
  const r = size * 0.17;
  const cx = size / 2;
  const cy = size / 2;
  const dx = r * Math.sqrt(3);
  const dy = r * 1.5;
  const hexes: Array<[number, number, string]> = [
    [0, 0, '#d6bd8a'],
    [0, -2 * dy, '#15803d'],
    [dx, -dy, '#ca8a04'],
    [dx, dy, '#b45309'],
    [0, 2 * dy, '#57534e'],
    [-dx, dy, '#a8a29e'],
    [-dx, -dy, '#15803d'],
  ];
  const settlement = size * 0.055;
  return {
    hexes: hexes.map(([ox, oy, fill]) => ({ points: hexPoints(cx + ox, cy + oy, r), fill })),
    road: {
      x1: cx - dx * 0.5, y1: cy - dy * 0.5, x2: cx + dx * 0.5, y2: cy - dy * 0.5,
      width: size * 0.05, color: '#e07b30',
    },
    settlements: [
      { cx: cx - dx * 0.5, cy: cy - dy * 0.5, r: settlement, fill: '#e07b30' },
      { cx: cx + dx * 0.5, cy: cy + dy * 1.5, r: settlement, fill: '#3498db' },
    ],
  };
}
