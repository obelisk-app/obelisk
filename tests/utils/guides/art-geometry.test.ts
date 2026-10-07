import { describe, expect, it } from 'vitest';
import { axialCenter, hexCorner, hexPoints, particleField, polarPoint, stackRows, staggerDelay } from '@/utils/guides/art-geometry';

describe('art geometry', () => {
  it('puts a polar point east at 0 degrees and south at 90 (SVG y grows down)', () => {
    expect(polarPoint(10, 20, 5, 0)).toEqual({ x: 15, y: 20 });
    const south = polarPoint(10, 20, 5, 90);
    expect(south.x).toBeCloseTo(10);
    expect(south.y).toBeCloseTo(25);
  });

  it('draws a hexagon whose six corners are all r from the centre', () => {
    for (let i = 0; i < 6; i++) {
      const [x, y] = hexCorner(100, 50, 30, i);
      expect(Math.hypot(x - 100, y - 50)).toBeCloseTo(30);
    }
    const points = hexPoints(100, 50, 30).split(' ');
    expect(points).toHaveLength(6);
    for (const p of points) expect(p).toMatch(/^-?\d+\.\d,-?\d+\.\d$/);
  });

  it('places axial neighbours one hex width apart', () => {
    expect(axialCenter(0, 0, 58, 300, 200)).toEqual([300, 200]);
    const [x, y] = axialCenter(1, 0, 58, 300, 200);
    expect(Math.hypot(x - 300, y - 200)).toBeCloseTo(58 * Math.sqrt(3));
  });

  it('spreads a particle field the same way every time, inside its bands', () => {
    const field = { x: { base: 100, step: 90, mod: 600 }, y: { base: 160, step: 37, mod: 120 }, delayStep: 0.6, durBase: 5, durCycle: 4 };
    const a = particleField(8, field);
    expect(a).toEqual(particleField(8, field));
    expect(a).toHaveLength(8);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(100);
      expect(p.x).toBeLessThan(700);
      expect(p.y).toBeGreaterThanOrEqual(160);
      expect(p.y).toBeLessThan(280);
    }
    expect(a[2]).toMatchObject({ i: 2, x: 280, y: 234, delay: '1.20s', dur: '7.0s' });
    expect(a[4].dur).toBe('5.0s');
  });

  it('stacks rows from a base and staggers delays to two decimals', () => {
    expect(stackRows([{ n: 'a' }, { n: 'b' }], 96, 62)).toEqual([{ n: 'a', i: 0, y: 96 }, { n: 'b', i: 1, y: 158 }]);
    expect(staggerDelay(3, 0.25)).toBe('0.75s');
    expect(staggerDelay(0, 0.4)).toBe('0.00s');
  });
});
