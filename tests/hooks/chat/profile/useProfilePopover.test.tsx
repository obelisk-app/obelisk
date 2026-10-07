import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { BRIDGE_MOCK_PUBKEY } from '@tests/support/mocks/nostr-bridge';
import { useChatStore } from '@/store/chat';
import { useProfilePopover } from '@/hooks/chat/profile/useProfilePopover';

const OTHER = 'c'.repeat(64);

describe('useProfilePopover', () => {
  afterEach(() => useChatStore.setState({ activeChannelId: null }));

  it('knows the reader\'s own card and encodes the npub', () => {
    const wrapper = bridgeWrapper(fakeBridge());
    expect(renderHook(() => useProfilePopover(BRIDGE_MOCK_PUBKEY, () => {}), { wrapper }).result.current.isSelf).toBe(true);
    const other = renderHook(() => useProfilePopover(OTHER, () => {}), { wrapper }).result.current;
    expect(other.isSelf).toBe(false);
    expect(other.npub).toMatch(/^npub1/);
    expect(other.displayName).not.toBe(OTHER);
  });

  it('a bad key has no npub to copy and shows the key itself as the short form', () => {
    const { result } = renderHook(() => useProfilePopover('not-hex', () => {}), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.npub).toBe('');
    expect(result.current.npubShort).toBe('not-hex');
  });

  it('zap closes only when a channel is open to prefill', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useProfilePopover(OTHER, onClose), { wrapper: bridgeWrapper(fakeBridge()) });
    act(() => result.current.zap());
    expect(onClose).not.toHaveBeenCalled();
    useChatStore.setState({ activeChannelId: 'g1' });
    act(() => result.current.zap());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
