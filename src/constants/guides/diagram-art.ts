/**
 * Guides: diagram art. Values the code in `utils/guides/diagram-art.ts` reads,
 * kept here so every reader imports the one copy.
 */

export const SWAP_ROW_HEIGHT = 64;

export const SWAP_TOP = 60;

export const SWAP_COL_W = 200;

export const COL_GAP = 16;

export const SWAP_LABEL_X = 24;

export const SWAP_COL_X = [
  SWAP_LABEL_X + 110,
  SWAP_LABEL_X + 110 + (SWAP_COL_W + COL_GAP),
  SWAP_LABEL_X + 110 + 2 * (SWAP_COL_W + COL_GAP),
];

export const ZAP_LANE_X = { C: 110, W: 335, L: 565, R: 790 } as const;
