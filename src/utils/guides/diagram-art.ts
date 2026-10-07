/**
 * The computed parts of the guide diagrams (`src/assets/illustrations/guides/diagrams/`):
 * the links from each client to the relay, the swap matrix's grid and the
 * zap flow's arrows. Same arithmetic the diagrams did inline, so their still
 * frames under `public/og/guides/` render identically.
 */

/* Relay groups */

/** A client tile at (`x`, `y`), with the dashed link from its inner side to the relay box's edge. */
export function relayGroupClients<T extends { x: number; y: number }>(clients: readonly T[]) {
  return clients.map((c) => ({
    ...c,
    fromX: c.x < 400 ? c.x + 32 : c.x - 32,
    toX: c.x < 400 ? 280 : 520,
    toY: 200,
  }));
}

/* Swap matrix */

export const SWAP_ROW_HEIGHT = 64;
export const SWAP_TOP = 60;
export const SWAP_COL_W = 200;
const COL_GAP = 16;
export const SWAP_LABEL_X = 24;
export const SWAP_COL_X = [
  SWAP_LABEL_X + 110,
  SWAP_LABEL_X + 110 + (SWAP_COL_W + COL_GAP),
  SWAP_LABEL_X + 110 + 2 * (SWAP_COL_W + COL_GAP),
];

export interface SwapRow {
  layer: string;
  ours: string;
  alts: string[];
}

/** Each layer's row: its top, its strand's stagger, and its three cells (ours first). */
export function swapMatrixRows(rows: readonly SwapRow[]) {
  return rows.map((row, i) => {
    const y = SWAP_TOP + i * SWAP_ROW_HEIGHT;
    const cells = [
      { x: SWAP_COL_X[0], label: row.ours, primary: true },
      { x: SWAP_COL_X[1], label: row.alts[0], primary: false },
      { x: SWAP_COL_X[2], label: row.alts[1], primary: false },
    ];
    return {
      layer: row.layer,
      y,
      strandDelay: `${(i * 0.3).toFixed(2)}s`,
      cells: cells.map((cell, j) => ({ ...cell, dotDelay: `${(i * 0.4 + j * 0.1).toFixed(2)}s` })),
    };
  });
}

/** The diagram's full height for `count` rows. */
export function swapMatrixHeight(count: number): number {
  return SWAP_TOP + count * SWAP_ROW_HEIGHT + 36;
}

/* Zap flow */

export const ZAP_LANE_X = { C: 110, W: 335, L: 565, R: 790 } as const;
export type ZapLane = keyof typeof ZAP_LANE_X;

/** One step of the flow: an arrow between two lanes at `y`, its head on the receiving side. */
export function zapArrows(rows: ReadonlyArray<{ y: number; from: ZapLane; to: ZapLane; label: string }>) {
  return rows.map((r, i) => {
    const x1 = ZAP_LANE_X[r.from];
    const x2 = ZAP_LANE_X[r.to];
    const right = x2 > x1;
    return {
      key: i,
      x1,
      x2,
      y: r.y,
      label: r.label,
      labelX: (x1 + x2) / 2,
      head: right
        ? `${x2 - 8},${r.y - 5} ${x2},${r.y} ${x2 - 8},${r.y + 5}`
        : `${x2 + 8},${r.y - 5} ${x2},${r.y} ${x2 + 8},${r.y + 5}`,
      delay: `${i * 0.25}s`,
    };
  });
}
