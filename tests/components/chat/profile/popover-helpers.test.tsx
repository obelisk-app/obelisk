import { render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmojiText } from '@/components/chat/profile/EmojiText';
import { websiteHref } from '@/utils/chat/profile/profile-links';
import { requestZapPrefill } from '@/services/chat/profile/zap-prefill';
import { usePopoverPlacement } from '@/hooks/chat/profile/usePopoverPlacement';
import { useChatStore } from '@/store/chat';

describe('EmojiText', () => {
  it('draws known custom emoji as images and keeps surrounding text', () => {
    const emojis = { obelisk_logo: 'https://x/logo.png' };
    // Rendered repeatedly on purpose: a shared global matcher used to leak
    // `lastIndex` and print the placeholder as text on the next call.
    for (let i = 0; i < 3; i += 1) {
      const { container, unmount } = render(<EmojiText text="hi :obelisk_logo: there" emojis={emojis} />);
      expect(container.querySelectorAll('img')).toHaveLength(1);
      expect(container.querySelector('img')).toHaveAttribute('alt', ':obelisk_logo:');
      expect(container.textContent).toBe('hi  there');
      unmount();
    }
  });

  it('returns plain text untouched', () => {
    expect(render(<EmojiText text="" emojis={{}} />).container.innerHTML).toBe('');
    const { container } = render(<EmojiText text="just text" emojis={{}} />);
    expect(container.innerHTML).toBe('just text');
  });
});

describe('websiteHref', () => {
  it('adds https:// only when no scheme is present', () => {
    expect(websiteHref('example.com')).toBe('https://example.com');
    expect(websiteHref('http://example.com')).toBe('http://example.com');
    expect(websiteHref('HTTPS://example.com')).toBe('HTTPS://example.com');
  });
});

describe('requestZapPrefill', () => {
  afterEach(() => useChatStore.setState({ activeChannelId: null }));

  it('does nothing without an open channel', () => {
    const onZap = vi.fn();
    window.addEventListener('obelisk:zap-prefill', onZap);
    useChatStore.setState({ activeChannelId: null });
    expect(requestZapPrefill('a'.repeat(64), 'Alice')).toBe(false);
    window.removeEventListener('obelisk:zap-prefill', onZap);
    expect(onZap).not.toHaveBeenCalled();
  });

  it('dispatches the prefill event when a channel is open', () => {
    const onZap = vi.fn();
    window.addEventListener('obelisk:zap-prefill', onZap);
    useChatStore.setState({ activeChannelId: 'g1' });
    expect(requestZapPrefill('a'.repeat(64), 'Alice')).toBe(true);
    window.removeEventListener('obelisk:zap-prefill', onZap);
    expect((onZap.mock.calls[0][0] as CustomEvent).detail).toEqual({ pubkey: 'a'.repeat(64), displayName: 'Alice' });
  });
});

describe('usePopoverPlacement', () => {
  function panel(width: number, height: number): HTMLDivElement {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: width });
    Object.defineProperty(el, 'offsetHeight', { value: height });
    return el;
  }

  it('sits right of and below the click when there is room', () => {
    const el = panel(300, 200);
    renderHook(() => usePopoverPlacement({ current: el }, { x: 100, y: 100 }));
    expect(el.style.left).toBe('112px');
    expect(el.style.top).toBe('108px');
  });

  it('flips left and up near the right and bottom edges', () => {
    const el = panel(300, 200);
    renderHook(() => usePopoverPlacement({ current: el }, { x: window.innerWidth - 50, y: window.innerHeight - 50 }));
    expect(el.style.left).toBe(`${window.innerWidth - 50 - 300 - 12}px`);
    expect(el.style.top).toBe(`${window.innerHeight - 50 - 200 - 8}px`);
  });

  it('leaves the panel alone without an anchor', () => {
    const el = panel(300, 200);
    renderHook(() => usePopoverPlacement({ current: el }, null));
    expect(el.style.left).toBe('');
  });
});
