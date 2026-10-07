import { afterEach, describe, expect, it, vi } from 'vitest';
import { flashMobileMessage } from '@/services/shell/mobile/message-flash';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('flashMobileMessage', () => {
  it('scrolls the message to the middle and tints it for a moment', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div data-msg-id="m1"></div>';
    const el = document.querySelector('[data-msg-id="m1"]')!;
    el.scrollIntoView = vi.fn();
    expect(flashMobileMessage('m1')).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(el.classList.contains('msg-flash')).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(el.classList.contains('msg-flash')).toBe(false);
  });

  it('does nothing for a message that is not on the page', () => {
    expect(flashMobileMessage('missing')).toBe(false);
  });
});
