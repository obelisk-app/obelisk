import { describe, expect, it } from 'vitest';
import {
  meshLines, orbOffsets, relayKeyDots, relayTierArcs, settledOrbs, vestaSettlements, vestaTiles, VESTA_R,
  wotEdges, wotNodeFill, wotNodeStroke,
} from '@/utils/guides/hero-art';

describe('chain reaction orbs', () => {
  it('draws one, two or three orbs per cell', () => {
    expect(orbOffsets(1)).toHaveLength(1);
    expect(orbOffsets(2)).toHaveLength(2);
    expect(orbOffsets(3)).toHaveLength(3);
    expect(orbOffsets(0)).toEqual([[0, 0]]);
  });

  it('centres a cell on its grid square and colours it by seat', () => {
    const [cell] = settledOrbs([{ col: 2, row: 1, count: 1, seat: 1 }], ['red', 'lime'], 60, 96, 54);
    expect(cell.key).toBe('orb-2-1');
    expect(cell.orbs).toEqual([{ cx: 60 + 2 * 54 + 27, cy: 96 + 54 + 27, fill: 'lime' }]);
  });
});

describe('future relays mesh', () => {
  it('joins the two nodes of each edge and staggers the dashes', () => {
    const lines = meshLines([{ cx: 0, cy: 0 }, { cx: 10, cy: 5 }, { cx: 20, cy: 0 }], [[0, 1], [1, 2]]);
    expect(lines).toEqual([
      { x1: 0, y1: 0, x2: 10, y2: 5, delay: '0.00s' },
      { x1: 10, y1: 5, x2: 20, y2: 0, delay: '0.25s' },
    ]);
  });
});

describe('relay hero', () => {
  const tiers = [{ r: 135, n: 1, opacity: 1 }, { r: 195, n: 2, opacity: 0.72 }, { r: 255, n: 3, opacity: 0.46 }];

  it('draws the inner arc solid and the outer two dashed and moving, thinner as they widen', () => {
    const arcs = relayTierArcs(tiers, 80, 200, 48);
    expect(arcs.map((a) => a.dash)).toEqual([undefined, '10 7', '4 9']);
    expect(arcs.map((a) => a.className)).toEqual([undefined, 'animate-dash-flow', 'animate-dash-flow']);
    expect(arcs[0].strokeWidth).toBeGreaterThan(arcs[2].strokeWidth);
    expect(arcs[1].d).toMatch(/^M \d+\.\d \d+\.\d A 195 195 0 0 1 \d+\.\d \d+\.\d$/);
  });

  it('puts every key on its ring, smaller and dimmer further out', () => {
    const dots = relayKeyDots([{ r: 135, angles: [0, 10] }, { r: 195, angles: [5] }], tiers, 80, 200);
    expect(dots.map((d) => d.key)).toEqual(['k0-0', 'k0-1', 'k1-0']);
    expect(Math.hypot(dots[2].x - 80, dots[2].y - 200)).toBeCloseTo(195);
    expect(dots[2].r).toBeLessThan(dots[0].r);
    expect(dots[2].opacity).toBeLessThan(dots[0].opacity);
    expect(dots[1].delay).toBe('0.17s');
  });
});

describe('web of trust hero', () => {
  it('colours a node by how far it is trusted', () => {
    expect(wotNodeFill(100, true)).toBe('#b4f953');
    expect(wotNodeFill(60)).toBe('#8bc34a');
    expect(wotNodeFill(30)).toBe('#2d3a1a');
    expect(wotNodeFill(29)).toBe('#3a1a1a');
    expect(wotNodeStroke(19)).toBe('#b45353');
    expect(wotNodeStroke(20)).toBe('#b4f953');
  });

  it('draws an edge touching a filtered key faint, red and dashed', () => {
    const byId = { you: { id: 'you', x: 0, y: 0, trust: 100 }, a: { id: 'a', x: 1, y: 1, trust: 80 }, s: { id: 's', x: 2, y: 2, trust: 5 } };
    const [ok, spam] = wotEdges(byId, [['you', 'a'], ['a', 's']]);
    expect(ok).toMatchObject({ stroke: '#b4f953', strokeOpacity: 0.45, dash: '0' });
    expect(spam).toMatchObject({ x2: 2, y2: 2, stroke: '#b45353', strokeOpacity: 0.25, dash: '3 5' });
  });
});

describe('vesta hero', () => {
  it('lays the tiles out around the centre and marks the 6 and 8 red', () => {
    const tiles = vestaTiles([[0, 0], [1, 0]], [{ hex: '#111', label: '6' }, { hex: '#222', label: '5' }]);
    expect(tiles[0]).toMatchObject({ key: '0-0', cx: 300, cy: 200, fill: '#111', label: '6', labelFill: '#ff4d5e' });
    expect(tiles[1].labelFill).toBe('#fafafa');
    expect(tiles[1].points.split(' ')).toHaveLength(6);
  });

  it('puts the settlements on corners of the centre tile', () => {
    const s = vestaSettlements();
    for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by], [s.dx, s.dy]]) {
      expect(Math.hypot(x - 300, y - 200)).toBeCloseTo(VESTA_R);
    }
  });
});
