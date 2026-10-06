import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import { DEFAULT_FORUM_PREFS } from '@/services/forum-prefs';
import { formatTimeAgo, posterName, resolveTopics } from '@/components/chat/forum/thread-card-utils';
import { SortViewMenu } from '@/components/chat/forum/SortViewMenu';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('thread card utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('formats the age on the shared relative-time scale, never negative', () => {
    const now = Math.floor(Date.now() / 1000);
    const t = (key: string) => `[${key}]`;
    expect(formatTimeAgo(now - 42, t, 'en')).toBe('[time.justNow]');
    expect(formatTimeAgo(now - 5 * 60, t, 'en')).toBe('5m');
    expect(formatTimeAgo(now - 3 * 3600, t, 'en')).toBe('3h');
    expect(formatTimeAgo(now - 2 * 86400, t, 'en')).toBe('2d');
    expect(formatTimeAgo(now + 100, t, 'en')).toBe('[time.justNow]');
    // Past a week it is a date, not an ever-growing day count.
    expect(formatTimeAgo(now - 30 * 86400, t, 'en')).toBe('Sep 5, 2026');
  });

  it('resolves topic ids once each, dropping unknown ones', () => {
    const tags = [
      { id: 'a', name: 'A', emoji: null, color: null },
      { id: 'b', name: 'B', emoji: null, color: null },
    ];
    expect(resolveTopics(['b', 'x', 'b', 'a'], tags).map((t) => t.id)).toEqual(['b', 'a']);
    expect(resolveTopics([], tags)).toEqual([]);
    expect(resolveTopics(['a'], [])).toEqual([]);
  });

  it('names a poster by display name, name, then short hex', () => {
    expect(posterName({ displayName: 'Ana', name: 'ana' }, 'f'.repeat(64))).toBe('Ana');
    expect(posterName({ name: 'ana' }, 'f'.repeat(64))).toBe('ana');
    expect(posterName(null, 'abcdef0123')).toBe('abcdef01…');
  });
});

describe('SortViewMenu', () => {
  it('opens, changes a pref, and closes on Escape or a press outside', () => {
    const onChange = vi.fn();
    renderLocalized(<div><SortViewMenu prefs={DEFAULT_FORUM_PREFS} onChange={onChange} /><p data-testid="away">x</p></div>);
    fireEvent.click(screen.getByTestId('forum-sortview-trigger'));
    fireEvent.click(screen.getByTestId('forum-view-gallery'));
    expect(onChange).toHaveBeenCalledWith({ viewMode: 'gallery' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('forum-sortview-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('forum-sortview-trigger'));
    fireEvent.mouseDown(screen.getByTestId('away'));
    expect(screen.queryByTestId('forum-sortview-menu')).toBeNull();
  });
});
