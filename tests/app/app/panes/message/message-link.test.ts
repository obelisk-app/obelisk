import { afterEach, describe, expect, it, vi } from 'vitest';
import { flashMessage, messageLink } from '@/app/app/panes/message/message-link';

describe('messageLink', () => {
  it('points at the channel and the message on this relay, dropping other params', () => {
    expect(messageLink('https://obelisk.ar/app?s=feed', 'g1', 'm1', 'wss://relay.example'))
      .toBe('https://obelisk.ar/app?c=g1&m=m1&relay=relay.example');
  });

  it('omits the relay when there is none', () => {
    expect(messageLink('https://obelisk.ar/app', 'g1', 'm1', '')).toBe('https://obelisk.ar/app?c=g1&m=m1');
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
