import { describe, expect, it, vi, afterEach } from 'vitest';
import { dayKey, dayLabel } from './day-label';

const t = (key: string) => (key === 'time.today' ? 'Today {time}' : key === 'time.yesterday' ? 'Yesterday' : key);
const secs = (d: Date) => Math.floor(d.getTime() / 1000);

afterEach(() => vi.useRealTimers());

describe('dayKey', () => {
  it('groups two times on the same calendar day', () => {
    const morning = new Date(2026, 4, 1, 9, 0, 0);
    const evening = new Date(2026, 4, 1, 23, 30, 0);
    expect(dayKey(secs(morning))).toBe(dayKey(secs(evening)));
  });

  it('separates midnight from the minute before it', () => {
    const before = new Date(2026, 4, 1, 23, 59, 59);
    const after = new Date(2026, 4, 2, 0, 0, 1);
    expect(dayKey(secs(before))).not.toBe(dayKey(secs(after)));
  });
});

describe('dayLabel', () => {
  it('says Today, with the time — the one day where that helps', () => {
    const now = new Date(2026, 4, 10, 14, 30, 0);
    vi.setSystemTime(now);
    expect(dayLabel(secs(now), t, 'en')).toMatch(/^Today /);
    expect(dayLabel(secs(now), t, 'en')).not.toContain('{time}');
  });

  it('says Yesterday', () => {
    vi.setSystemTime(new Date(2026, 4, 10, 9, 0, 0));
    const yesterday = new Date(2026, 4, 9, 18, 0, 0);
    expect(dayLabel(secs(yesterday), t, 'en')).toBe('Yesterday');
  });

  it('falls back to a short date for anything older', () => {
    vi.setSystemTime(new Date(2026, 4, 10, 9, 0, 0));
    const older = new Date(2026, 3, 2, 12, 0, 0);
    const label = dayLabel(secs(older), t, 'en');
    expect(label).not.toMatch(/Today|Yesterday/);
    expect(label).toMatch(/Apr/);
  });

  it('still says Yesterday across a month boundary', () => {
    // Apr 30 really is the day before May 1 — the label follows the calendar
    // day, not the month.
    vi.setSystemTime(new Date(2026, 4, 1, 9, 0, 0));
    expect(dayLabel(secs(new Date(2026, 3, 30, 9, 0, 0)), t, 'en')).toBe('Yesterday');
  });

  it('dates anything before that, across the month boundary', () => {
    vi.setSystemTime(new Date(2026, 4, 1, 9, 0, 0));
    expect(dayLabel(secs(new Date(2026, 3, 29, 9, 0, 0)), t, 'en')).toBe('Apr 29');
  });
});
