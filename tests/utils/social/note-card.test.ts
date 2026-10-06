import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MouseEvent } from 'react';
import { bodyClickHandler, LONG_NOTE_CHARS } from '@/utils/social/note-card';
import { relativeTime as sharedRelativeTime } from '@/utils/format/relative-time';
import type { Locale } from '@/i18n';

// The note header uses the shared helper with the feed's own "now" key.
const relativeTime = (createdAt: number, translate: (key: string) => string, locale: Locale) =>
  sharedRelativeTime(createdAt, translate, locale, 'social.now');

const t = (key: string) => key;

function clickOn(target: Element): MouseEvent<HTMLElement> {
  return { target } as unknown as MouseEvent<HTMLElement>;
}

describe('bodyClickHandler', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('is absent when there is nothing to open', () => {
    expect(bodyClickHandler(undefined)).toBeUndefined();
  });

  it('opens on a click on plain body text', () => {
    const open = vi.fn();
    const p = document.createElement('p');
    document.body.append(p);
    bodyClickHandler(open)!(clickOn(p));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('steps aside for real controls inside the card', () => {
    const open = vi.fn();
    const handler = bodyClickHandler(open)!;
    for (const tag of ['a', 'button', 'input', 'textarea', 'video', 'audio']) {
      const el = document.createElement(tag);
      document.body.append(el);
      handler(clickOn(el));
    }
    const marked = document.createElement('div');
    marked.setAttribute('data-no-thread', '');
    const inner = document.createElement('span');
    marked.append(inner);
    document.body.append(marked);
    handler(clickOn(inner));
    expect(open).not.toHaveBeenCalled();
  });

  it('ignores a click that ended a text selection', () => {
    const open = vi.fn();
    const p = document.createElement('p');
    p.textContent = 'selected words';
    document.body.append(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()!.addRange(range);
    bodyClickHandler(open)!(clickOn(p));
    expect(open).not.toHaveBeenCalled();
  });
});

describe('relativeTime', () => {
  const NOW = 1_700_000_000;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
  });
  afterEach(() => vi.useRealTimers());

  it('steps through now, minutes, hours and days', () => {
    expect(relativeTime(NOW - 10, t, 'en')).toBe('social.now');
    expect(relativeTime(NOW - 120, t, 'en')).toBe('2m');
    expect(relativeTime(NOW - 7200, t, 'en')).toBe('2h');
    expect(relativeTime(NOW - 3 * 86400, t, 'en')).toBe('3d');
  });

  it('treats a timestamp from the future as now', () => {
    expect(relativeTime(NOW + 600, t, 'en')).toBe('social.now');
  });

  it('falls back to a date after a week', () => {
    const label = relativeTime(NOW - 30 * 86400, t, 'en');
    expect(label).toMatch(/2023/);
  });
});

it('collapses notes above a thousand characters', () => {
  expect(LONG_NOTE_CHARS).toBe(1000);
});
