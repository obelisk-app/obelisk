import { describe, expect, it } from 'vitest';
import { createStars, resetStar, stepStar, type Star } from '@/hooks/marketing/shooting-stars-canvas';

const always = (n: number) => () => n;
const blank = (): Star => ({ x: 0, y: 0, len: 0, speed: 0, opacity: 0, active: false, timer: 0, interval: 0 });

describe('shooting stars', () => {
  it('parks a streak hidden, 3 to 11 s from showing, in the upper part of the canvas', () => {
    const low = blank();
    resetStar(low, 1000, 500, always(0));
    expect(low).toMatchObject({ active: false, timer: 0, opacity: 0, interval: 3000, x: 100, y: 0, len: 60, speed: 400 });
    const high = blank();
    resetStar(high, 1000, 500, always(0.999999));
    expect(high.interval).toBeCloseTo(11000, 0);
    expect(high.x).toBeCloseTo(900, 0);
    expect(high.y).toBeCloseTo(300, 0);
  });

  it('staggers the pool\'s first appearances over the first 6 s', () => {
    const stars = createStars(3, 800, 600, always(0.5));
    expect(stars).toHaveLength(3);
    for (const s of stars) expect(s.interval).toBe(3000);
  });

  it('waits out its interval, then moves down and to the left while fading in', () => {
    const s = blank();
    resetStar(s, 1000, 1000, always(0.5));
    s.interval = 100;
    expect(stepStar(s, 0.05, 1000, 1000)).toBe(false);
    expect(s.active).toBe(false);
    expect(stepStar(s, 0.06, 1000, 1000)).toBe(false);
    expect(s.active).toBe(true);
    const { x, y } = s;
    expect(stepStar(s, 0.1, 1000, 1000)).toBe(true);
    expect(s.x).toBeLessThan(x);
    expect(s.y).toBeGreaterThan(y);
    expect(s.opacity).toBeCloseTo(0.4);
    for (let i = 0; i < 5; i++) stepStar(s, 0.01, 1000, 1000);
    expect(s.opacity).toBeLessThanOrEqual(0.9);
  });

  it('parks a streak again once it has left the canvas', () => {
    const s = { ...blank(), active: true, x: -150, y: 10, speed: 500, opacity: 0.9 };
    expect(stepStar(s, 0.016, 1000, 1000, always(0))).toBe(false);
    expect(s).toMatchObject({ active: false, x: 100, y: 0 });
  });
});
