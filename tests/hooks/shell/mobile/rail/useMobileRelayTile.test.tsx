import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';

const relayInfo = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/services/relay/relay-info', () => ({
  faviconFor: (url: string) => (url.startsWith('wss://') ? `https://favicon/${url}` : null),
  fetchRelayInfo: (url: string) => relayInfo.fetch(url),
}));
vi.mock('@/hooks/relay/useRelayBranding', () => ({ useRelayBranding: () => ({}) }));
const unread = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/hooks/notifications/useNotificationSelectors', () => ({
  useUnreadMentionCount: (relay: string | null) => (relay ? unread.count : 0),
}));

import { RELAY_TILE_LONG_PRESS_MS, useMobileRelayTile } from '@/hooks/shell/mobile/rail/useMobileRelayTile';

const URL_ = 'wss://relay.example';

beforeEach(() => {
  relayInfo.fetch.mockReset().mockResolvedValue(null);
  unread.count = 0;
});
afterEach(() => { vi.useRealTimers(); });

describe('useMobileRelayTile', () => {
  it('labels the tile by host and draws the favicon until it fails', () => {
    const { result } = renderHook(() => useMobileRelayTile(URL_, false, () => {}));
    expect(result.current.label).toBe('relay.example');
    expect(result.current.letter).toBe('R');
    expect(result.current.iconUrl).toBe(`https://favicon/${URL_}`);
    act(() => result.current.onIconError());
    expect(result.current.iconUrl).toBeNull();
  });

  it('has no icon when the URL has no favicon', () => {
    const { result } = renderHook(() => useMobileRelayTile('relay.example', false, () => {}));
    expect(result.current.iconUrl).toBeNull();
  });

  it('takes the NIP-11 name once it arrives', async () => {
    relayInfo.fetch.mockResolvedValue({ name: 'Example' });
    const { result } = renderHook(() => useMobileRelayTile(URL_, false, () => {}));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.label).toBe('Example');
    expect(result.current.letter).toBe('E');
  });

  it('badges unread mentions only on a relay you are not on', () => {
    unread.count = 120;
    const off = renderHook(() => useMobileRelayTile(URL_, false, () => {}));
    expect(off.result.current.backgroundUnread).toBe(120);
    expect(off.result.current.badgeText).toBe('99+');
    const on = renderHook(() => useMobileRelayTile(URL_, true, () => {}));
    expect(on.result.current.backgroundUnread).toBe(0);
  });

  it('a held touch fires the long press once, and swallows the click that ends it', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useMobileRelayTile(URL_, false, onClick, onLongPress));
    act(() => result.current.startPress());
    act(() => { vi.advanceTimersByTime(RELAY_TILE_LONG_PRESS_MS); });
    expect(onLongPress).toHaveBeenCalledWith({ url: URL_, label: 'relay.example', iconUrl: `https://favicon/${URL_}` });
    act(() => result.current.onClick());
    expect(onClick).not.toHaveBeenCalled();
    act(() => result.current.onClick());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a touch released early is a tap', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useMobileRelayTile(URL_, false, onClick, onLongPress));
    act(() => result.current.startPress());
    act(() => { vi.advanceTimersByTime(RELAY_TILE_LONG_PRESS_MS - 1); });
    act(() => result.current.cancelPress());
    act(() => { vi.advanceTimersByTime(RELAY_TILE_LONG_PRESS_MS); });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => result.current.onClick());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('right-click opens the long-press menu instead of the native one', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useMobileRelayTile(URL_, false, () => {}, onLongPress));
    const preventDefault = vi.fn();
    act(() => result.current.onContextMenu!({ preventDefault } as unknown as MouseEvent));
    expect(preventDefault).toHaveBeenCalled();
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('without a long-press handler, touches never arm a timer and right-click is left alone', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const { result } = renderHook(() => useMobileRelayTile(URL_, false, onClick));
    expect(result.current.onContextMenu).toBeUndefined();
    act(() => result.current.startPress());
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.onClick());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
