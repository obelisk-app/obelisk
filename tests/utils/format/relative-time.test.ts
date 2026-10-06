import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { relativeTime } from '@/utils/format/relative-time';

const t = (key: string) => `<${key}>`;
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const secondsAgo = (s: number) => Math.floor((NOW - s * 1000) / 1000);

  it('uses the caller\'s "just now" key under a minute', () => {
    expect(relativeTime(secondsAgo(30), t, 'en')).toBe('<time.justNow>');
    expect(relativeTime(secondsAgo(30), t, 'en', 'social.now')).toBe('<social.now>');
  });

  it('steps through minutes, hours and days', () => {
    expect(relativeTime(secondsAgo(5 * 60), t, 'en')).toBe('5m');
    expect(relativeTime(secondsAgo(3 * 3600), t, 'en')).toBe('3h');
    expect(relativeTime(secondsAgo(2 * 86400), t, 'en')).toBe('2d');
  });

  it('falls back to a dated label after a week', () => {
    const label = relativeTime(secondsAgo(10 * 86400), t, 'en');
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/Sep/);
  });
});
