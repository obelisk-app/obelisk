import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyQuietly, emitMobileReaction, requestMobileReply } from '@/services/shell/mobile/message-actions';
import { REACT_EVENT, REPLY_EVENT } from '@/constants/shell/mobile';

function listen(name: string) {
  const listener = vi.fn();
  window.addEventListener(name, listener as EventListener);
  return { listener, stop: () => window.removeEventListener(name, listener as EventListener) };
}

afterEach(() => vi.restoreAllMocks());

describe('emitMobileReaction', () => {
  it('sends the message and a plain emoji', () => {
    const { listener, stop } = listen(REACT_EVENT);
    emitMobileReaction({ id: 'm' }, '👍');
    stop();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ msg: { id: 'm' }, emoji: '👍', customEmojis: undefined });
  });

  it('carries a custom emoji as a name to url map', () => {
    const { listener, stop } = listen(REACT_EVENT);
    emitMobileReaction({ id: 'm' }, ':party:', { name: 'party', url: 'https://x/p.webp' });
    stop();
    expect((listener.mock.calls[0][0] as CustomEvent).detail.customEmojis).toEqual({ party: 'https://x/p.webp' });
  });
});

describe('requestMobileReply', () => {
  it('names the message to reply to', () => {
    const { listener, stop } = listen(REPLY_EVENT);
    requestMobileReply('m7');
    stop();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ msgId: 'm7' });
  });
});

describe('copyQuietly', () => {
  it('writes to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    copyQuietly('hi');
    expect(writeText).toHaveBeenCalledWith('hi');
  });

  it('swallows a refusal, thrown or rejected, and a missing clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => { throw new Error('no'); } }, configurable: true });
    expect(() => copyQuietly('hi')).not.toThrow();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true });
    expect(() => copyQuietly('hi')).not.toThrow();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    expect(() => copyQuietly('hi')).not.toThrow();
    await Promise.resolve();
  });
});
