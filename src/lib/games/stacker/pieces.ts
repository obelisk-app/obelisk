/**
 * The seven pieces: shapes, rotation, wall kicks and the deterministic bag
 * that deals them. Nothing here knows about a board or a game; `engine.ts`
 * composes these into play.
 */

export const PIECES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;
export type PieceKind = (typeof PIECES)[number];

/** Spawn shapes, as offsets from the piece origin, in rotation state 0. */
const SHAPES: Record<PieceKind, Array<[number, number]>> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};

/** Rotation is about the piece's bounding box: 3×3 for most, 4×4 for I and O. */
export const BOX: Record<PieceKind, number> = { I: 4, J: 3, L: 3, O: 4, S: 3, T: 3, Z: 3 };

export type Rotation = 0 | 1 | 2 | 3;

export interface ActivePiece {
  kind: PieceKind;
  /** Top-left of the piece's bounding box, in board coordinates. */
  x: number;
  y: number;
  rotation: Rotation;
}

/* ── deterministic randomness ─────────────────────────────────────────── */

/** mulberry32, same generator Vesta uses, so both games shuffle alike. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The 7-bag: every seven pieces contain each shape exactly once, shuffled.
 * Bag `n` is derived from `seed + n`, so any client can produce the sequence
 * from any point without replaying the ones before it.
 */
export function bag(seed: number, index: number): PieceKind[] {
  const rng = mulberry32((seed + index * 0x9e3779b9) >>> 0);
  const out = [...PIECES];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── geometry ─────────────────────────────────────────────────────────── */

/** Cells a piece occupies, in board coordinates. */
export function cellsOf(piece: ActivePiece): Array<[number, number]> {
  const box = BOX[piece.kind];
  return SHAPES[piece.kind].map(([sx, sy]) => {
    let x = sx;
    let y = sy;
    for (let r = 0; r < piece.rotation; r++) {
      const nx = box - 1 - y;
      const ny = x;
      x = nx;
      y = ny;
    }
    return [piece.x + x, piece.y + y] as [number, number];
  });
}

/** SRS wall kicks. Index by `from*4 + to`; I has its own table. */
const KICKS_JLSTZ: Record<string, Array<[number, number]>> = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const KICKS_I: Record<string, Array<[number, number]>> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function kicksFor(kind: PieceKind, from: Rotation, to: Rotation): Array<[number, number]> {
  if (kind === 'O') return [[0, 0]];
  const table = kind === 'I' ? KICKS_I : KICKS_JLSTZ;
  return table[`${from}>${to}`] ?? [[0, 0]];
}
