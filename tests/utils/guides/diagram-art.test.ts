import { describe, expect, it } from 'vitest';
import { relayGroupClients, SWAP_COL_X, SWAP_TOP, swapMatrixHeight, swapMatrixRows, zapArrows, ZAP_LANE_X } from '@/utils/guides/diagram-art';

describe('relay groups diagram', () => {
  it('links each client from its inner side to the near edge of the relay box', () => {
    const [left, right] = relayGroupClients([{ x: 80, y: 90 }, { x: 720, y: 90 }]);
    expect(left).toMatchObject({ fromX: 112, toX: 280, toY: 200 });
    expect(right).toMatchObject({ fromX: 688, toX: 520, toY: 200 });
  });
});

describe('swap matrix diagram', () => {
  const rows = [
    { layer: 'Client', ours: 'obelisk-dex', alts: ['a', 'b'] },
    { layer: 'Relay', ours: 'obelisk-relay', alts: ['strfry', 'nostr-rs-relay'] },
  ];

  it('steps each layer down a row and puts ours first in its own column', () => {
    const grid = swapMatrixRows(rows);
    expect(grid[0].y).toBe(SWAP_TOP);
    expect(grid[1].y).toBeGreaterThan(grid[0].y);
    expect(grid[1].cells.map((c) => [c.x, c.label, c.primary])).toEqual([
      [SWAP_COL_X[0], 'obelisk-relay', true],
      [SWAP_COL_X[1], 'strfry', false],
      [SWAP_COL_X[2], 'nostr-rs-relay', false],
    ]);
    expect(grid[1].strandDelay).toBe('0.30s');
    expect(grid[1].cells[2].dotDelay).toBe('0.60s');
  });

  it('grows the drawing with the number of rows', () => {
    expect(swapMatrixHeight(4) - swapMatrixHeight(3)).toBe(swapMatrixHeight(1) - swapMatrixHeight(0));
  });
});

describe('zap flow diagram', () => {
  it('points each arrow at the lane it goes to and labels it halfway', () => {
    const [toRight, toLeft] = zapArrows([
      { y: 84, from: 'C', to: 'L', label: 'request' },
      { y: 126, from: 'L', to: 'C', label: 'invoice' },
    ]);
    expect(toRight.head).toBe(`${ZAP_LANE_X.L - 8},79 ${ZAP_LANE_X.L},84 ${ZAP_LANE_X.L - 8},89`);
    expect(toLeft.head).toBe(`${ZAP_LANE_X.C + 8},121 ${ZAP_LANE_X.C},126 ${ZAP_LANE_X.C + 8},131`);
    expect(toRight.labelX).toBe((ZAP_LANE_X.C + ZAP_LANE_X.L) / 2);
    expect(toLeft.delay).toBe('0.25s');
  });
});
