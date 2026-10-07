import { describe, expect, it } from 'vitest';
import { chainReactionPreview, hexPoints, orbCircles, vestaPreview } from '@/utils/games/new-game/preview-geometry';

describe('chainReactionPreview', () => {
  it('lays a 4×5 grid of cells with gaps into the thumbnail', () => {
    const { cell, cells } = chainReactionPreview(56);
    expect(cell).toBeCloseTo((56 - 4.5) / 4);
    expect(cells).toHaveLength(20);
    expect(cells[0]).toMatchObject({ x: 0, y: 0 });
    expect(cells[5].x).toBeCloseTo(cell + 1.5);
    expect(cells[5].y).toBeCloseTo(cell + 1.5);
  });

  it('stamps sixteen orbs over eleven cells and leaves the rest empty', () => {
    const { cells } = chainReactionPreview(56);
    const stamped = cells.filter((c) => c.orbs);
    expect(stamped).toHaveLength(11);
    expect(stamped.reduce((n, c) => n + c.orbs!.count, 0)).toBe(16);
    expect(cells[5].orbs).toEqual({ count: 3, color: '#ef4444' });
    expect(cells[1].orbs).toBeNull();
  });
});

describe('orbCircles', () => {
  it('centres one orb, pairs two side by side and stacks three in a triangle', () => {
    expect(orbCircles(0, 0, 10, 1)).toEqual([{ cx: 5, cy: 5, r: 1.6 }]);
    expect(orbCircles(0, 0, 10, 2).map((c) => c.cx)).toEqual([3.4, 6.6]);
    const three = orbCircles(10, 20, 10, 3);
    expect(three).toHaveLength(3);
    expect(three[2]).toEqual({ cx: 15, cy: 23.4, r: 1.6 });
  });
});

describe('vesta preview', () => {
  it('draws a pointy-top hex from six corners', () => {
    const corners = hexPoints(10, 10, 2).split(' ').map((p) => p.split(',').map(Number));
    expect(corners).toHaveLength(6);
    expect(corners[0][0]).toBeCloseTo(10);
    expect(corners[0][1]).toBeCloseTo(8);
  });

  it('draws seven hexes, a road and two settlements scaled to the thumbnail', () => {
    const view = vestaPreview(100);
    expect(view.hexes).toHaveLength(7);
    expect(view.hexes[0].fill).toBe('#d6bd8a');
    expect(view.road.width).toBe(5);
    expect(view.settlements.map((s) => s.fill)).toEqual(['#e07b30', '#3498db']);
    expect(view.settlements[0].r).toBeCloseTo(5.5);
  });
});
