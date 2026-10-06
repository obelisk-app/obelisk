import { describe, expect, it } from 'vitest';
import { formatCount } from '@/utils/format/format-count';

describe('formatCount', () => {
  it('abbreviates thousands and millions without jitter', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1234)).toBe('1.2k');
    expect(formatCount(1500)).toBe('1.5k');
    expect(formatCount(12345)).toBe('12k');
    expect(formatCount(25_000)).toBe('25k');
    expect(formatCount(1_250_000)).toBe('1.3M');
    expect(formatCount(2_400_000)).toBe('2.4M');
  });
});
