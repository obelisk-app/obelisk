import { describe, expect, it } from 'vitest';
import { formatBytes } from '@/utils/format/format-bytes';

describe('formatBytes', () => {
  it('is empty for a missing or zero size, so the caller can filter it out of a label', () => {
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(0)).toBe('');
  });

  it('keeps bytes whole under a kilobyte', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('rounds kilobytes to a whole number', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB');
  });

  it('gives megabytes one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(25 * 1024 * 1024 + 512 * 1024)).toBe('25.5 MB');
  });
});
