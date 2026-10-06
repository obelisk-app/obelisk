import { describe, expect, it } from 'vitest';
import { formatElapsed } from '@/utils/format/format-elapsed';

describe('formatElapsed', () => {
  it('shows m:ss under an hour, with seconds zero-padded', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(5_000)).toBe('0:05');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('adds hours and pads minutes once it passes an hour', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_600_000 + 5 * 60_000 + 7_000)).toBe('1:05:07');
  });

  it('floors sub-second remainders and clamps a negative delta to zero', () => {
    expect(formatElapsed(1_999)).toBe('0:01');
    expect(formatElapsed(-5_000)).toBe('0:00');
  });

  it('reads 0:00 for a duration that is not a finite number', () => {
    expect(formatElapsed(Number.NaN)).toBe('0:00');
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe('0:00');
    // The voice player passes seconds times 1000: a fractional second floors.
    expect(formatElapsed(65.9 * 1000)).toBe('1:05');
  });
});
