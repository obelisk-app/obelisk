import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLASH_MS, flashMessage, isTypingTarget, scrollToId } from '@/utils/scroll/message-flash';

describe('mention scroll helpers', () => {
  afterEach(() => vi.useRealTimers());

  it('treats inputs, textareas and editable elements as typing targets', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('scrolls to a message and flashes it for a moment', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const row = document.createElement('div');
    row.setAttribute('data-msg-id', 'abc');
    row.scrollIntoView = vi.fn();
    root.appendChild(row);
    expect(scrollToId(root, 'abc')).toBe(true);
    expect(row.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(row.classList.contains('ring-lc-green')).toBe(true);
    vi.advanceTimersByTime(FLASH_MS);
    expect(row.classList.contains('ring-lc-green')).toBe(false);
    expect(scrollToId(root, 'missing')).toBe(false);
    expect(scrollToId(null, 'abc')).toBe(false);
  });
});

describe('flashMessage', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('scrolls the message into view and removes the ring after the given time', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div data-msg-id="m1"></div>';
    const el = document.querySelector('[data-msg-id="m1"]') as HTMLElement;
    el.scrollIntoView = vi.fn();
    flashMessage('m1', 1200);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(el.classList.contains('ring-lc-green')).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(el.classList.contains('ring-lc-green')).toBe(false);
  });

  it('does nothing when the message is not on screen', () => {
    expect(() => flashMessage('missing', 1200)).not.toThrow();
  });
});
