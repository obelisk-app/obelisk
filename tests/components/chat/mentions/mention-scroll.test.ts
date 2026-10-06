import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLASH_MS, isTypingTarget, scrollToId } from '@/components/chat/mentions/mention-scroll';

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
