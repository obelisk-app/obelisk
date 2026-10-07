import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_RELAY } from '@tests/support/mocks/nostr-bridge';
import { channelPrefKey, useChannelPrefsStore } from '@/store/chat/channel-prefs';
import { useChannelRow, useChannelRowBody } from '@/hooks/shell/mobile/screens/server/useChannelRow';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const ev = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as MouseEvent & Record<'preventDefault' | 'stopPropagation', ReturnType<typeof vi.fn>>;
const run = <T,>(hook: () => T, seed: Parameters<typeof fakeBridge>[0] = {}) =>
  renderHook(hook, { wrapper: bridgeWrapper(fakeBridge(seed)) }).result;

beforeEach(() => useChannelPrefsStore.setState({ prefs: {} }));
afterEach(() => vi.useRealTimers());

describe('useChannelRow', () => {
  it('has a menu for a text channel on a relay, not for voice or with no relay', () => {
    expect(run(() => useChannelRow(group({ id: 'g' }))).current.hasMenu).toBe(true);
    expect(run(() => useChannelRow(group({ id: 'v', kind: 'voice-sfu' }))).current.hasMenu).toBe(false);
    expect(run(() => useChannelRow(group({ id: 'g' })), { currentRelayUrl: '' }).current.hasMenu).toBe(false);
  });

  it('opens the menu after a held touch and swallows the next click only', () => {
    vi.useFakeTimers();
    const result = run(() => useChannelRow(group({ id: 'g', name: 'general' })));
    expect(result.current.target).toMatchObject({ relay: BRIDGE_MOCK_RELAY, channelId: 'g', name: 'general', hasUnread: false });
    act(() => result.current.onTouchStart());
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.menuOpen).toBe(true);
    const first = ev();
    act(() => result.current.onClickCapture(first));
    expect(first.stopPropagation).toHaveBeenCalled();
    const second = ev();
    act(() => result.current.onClickCapture(second));
    expect(second.stopPropagation).not.toHaveBeenCalled();
    act(() => result.current.closeMenu());
    expect(result.current.menuOpen).toBe(false);
  });

  it('cancels a press that ends early', () => {
    vi.useFakeTimers();
    const result = run(() => useChannelRow(group({ id: 'g' })));
    act(() => result.current.onTouchStart());
    act(() => result.current.cancelPress());
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current.menuOpen).toBe(false);
  });
});

describe('useChannelRowBody', () => {
  it('quiets an unfollowed channel and zeroes its unread', () => {
    useChannelPrefsStore.setState({ prefs: { [channelPrefKey(BRIDGE_MOCK_RELAY, 'g')]: { unfollowed: true } } });
    const result = run(() => useChannelRowBody(group({ id: 'g' })));
    expect(result.current).toMatchObject({ name: 'g', muted: false, unread: 0, quietStyle: { opacity: 0.55 } });
  });

  it('leaves a followed channel at full strength', () => {
    expect(run(() => useChannelRowBody(group({ id: 'g', name: 'x' }))).current.quietStyle).toBeUndefined();
  });
});
