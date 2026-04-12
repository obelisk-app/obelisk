import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadTracker } from './useReadTracker';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';

// Spy on the broadcast module so we can assert sibling-tab sync is fired
// on every successful flush without actually hitting a BroadcastChannel.
vi.mock('@/lib/notification-broadcast', () => ({
  postClearChannel: vi.fn(),
  postClearDM: vi.fn(),
}));
import * as broadcast from '@/lib/notification-broadcast';

type FakeSocket = { emit: ReturnType<typeof vi.fn> };

function makeSocket(): FakeSocket {
  return { emit: vi.fn() };
}

function resetStores() {
  useChatStore.setState({
    activeChannelId: null,
    messages: [],
    isNearBottom: true,
  } as any);
  useDMStore.setState({
    activeDMPubkey: null,
    messages: [],
    threads: [],
  } as any);
  useNotificationStore.setState(useNotificationStore.getInitialState());
}

function setVisible(value: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (value ? 'visible' : 'hidden'),
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function setFocused(value: boolean) {
  // jsdom's hasFocus always returns true; stub it.
  vi.spyOn(document, 'hasFocus').mockReturnValue(value);
  if (value) window.dispatchEvent(new Event('focus'));
  else window.dispatchEvent(new Event('blur'));
}

describe('useReadTracker — channel gating', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    socket = makeSocket();
    // Default to visible + focused — individual tests override.
    setVisible(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    (broadcast.postClearChannel as any).mockClear();
    (broadcast.postClearDM as any).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('broadcasts clear-channel to sibling tabs after a successful flush', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      messages: [{ id: 'm1' }] as any,
      isNearBottom: true,
    } as any);
    useNotificationStore.getState().setChannelUnread('ch1', 2, false);

    renderHook(() => useReadTracker(socket as any));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(broadcast.postClearChannel).toHaveBeenCalledWith('ch1');
  });

  it('marks a channel read when visible + focused + scrolled to bottom + has unread', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      messages: [{ id: 'm1' }] as any,
      isNearBottom: true,
    } as any);
    useNotificationStore.getState().setChannelUnread('ch1', 3, false);

    renderHook(() => useReadTracker(socket as any));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(socket.emit).toHaveBeenCalledWith('mark-read', {
      channelId: 'ch1',
      lastMessageId: 'm1',
    });
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBeUndefined();
  });

  it('does NOT mark read when tab is hidden', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      messages: [{ id: 'm1' }] as any,
      isNearBottom: true,
    } as any);
    useNotificationStore.getState().setChannelUnread('ch1', 3, false);

    const { rerender } = renderHook(() => useReadTracker(socket as any));
    act(() => {
      setVisible(false);
      rerender();
      vi.advanceTimersByTime(300);
    });

    expect(socket.emit).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBe(3);
  });

  it('does NOT mark read when window is blurred', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      messages: [{ id: 'm1' }] as any,
      isNearBottom: true,
    } as any);
    useNotificationStore.getState().setChannelUnread('ch1', 3, false);

    const { rerender } = renderHook(() => useReadTracker(socket as any));
    act(() => {
      setFocused(false);
      rerender();
      vi.advanceTimersByTime(300);
    });

    expect(socket.emit).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBe(3);
  });

  it('does NOT mark read when scrolled up', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      messages: [{ id: 'm1' }] as any,
      isNearBottom: false,
    } as any);
    useNotificationStore.getState().setChannelUnread('ch1', 3, false);

    renderHook(() => useReadTracker(socket as any));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(socket.emit).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBe(3);
  });

  it('does not fire when there is nothing to clear', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      messages: [{ id: 'm1' }] as any,
      isNearBottom: true,
    } as any);
    // no unread set

    renderHook(() => useReadTracker(socket as any));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('fires after tab becomes visible with unread pending', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      messages: [{ id: 'm1' }] as any,
      isNearBottom: true,
    } as any);
    useNotificationStore.getState().setChannelUnread('ch1', 2, true);
    setVisible(false);

    renderHook(() => useReadTracker(socket as any));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(socket.emit).not.toHaveBeenCalled();

    act(() => {
      setVisible(true);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(socket.emit).toHaveBeenCalledWith('mark-read', expect.objectContaining({ channelId: 'ch1' }));
  });

  it('debounces — rapid message arrivals collapse to one mark-read with latest id', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      messages: [{ id: 'm1' }] as any,
      isNearBottom: true,
    } as any);
    useNotificationStore.getState().setChannelUnread('ch1', 1, false);

    renderHook(() => useReadTracker(socket as any));

    // Each setState+advance is its own act() so React flushes the hook
    // between steps; otherwise the fake-timer advance runs inside the same
    // render commit as the setState and swallows the dep update.
    act(() => {
      useChatStore.setState({ messages: [{ id: 'm1' }, { id: 'm2' }] } as any);
    });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => {
      useChatStore.setState({ messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] } as any);
    });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => {
      useChatStore.setState({ messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }] } as any);
    });
    act(() => { vi.advanceTimersByTime(300); });

    // The last successful call must carry m4 (each rapid update cancels the
    // previous debounce).
    const calls = socket.emit.mock.calls.filter(c => c[0] === 'mark-read');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][1]).toEqual({
      channelId: 'ch1',
      lastMessageId: 'm4',
    });
  });
});

describe('useReadTracker — DM gating', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    socket = makeSocket();
    setVisible(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    // Fallback fetch mock — exercised only when no socket is available.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
    (broadcast.postClearChannel as any).mockClear();
    (broadcast.postClearDM as any).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clears DM unread locally (localStorage) without contacting the server', () => {
    const other = 'aa'.repeat(32);
    useDMStore.setState({
      activeDMPubkey: other,
      messages: [{ id: 'd1' }] as any,
      threads: [{ pubkey: other, displayName: 'x', unreadCount: 2 }],
      readCursors: {},
    } as any);
    useNotificationStore.getState().setDMUnread(other, 2);

    renderHook(() => useReadTracker(socket as any));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // No network calls of any kind — DM read state is device-local.
    expect(socket.emit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().dmUnreads[other]).toBeUndefined();
    expect(useDMStore.getState().threads.find(t => t.pubkey === other)?.unreadCount).toBe(0);
    expect(useDMStore.getState().readCursors[other]).toBeGreaterThan(0);
    expect(broadcast.postClearDM).toHaveBeenCalledWith(other);
  });

  it('clears DM unread locally even when no socket is provided', () => {
    const other = 'cc'.repeat(32);
    useDMStore.setState({
      activeDMPubkey: other,
      messages: [{ id: 'd1' }] as any,
      threads: [{ pubkey: other, displayName: 'x', unreadCount: 1 }],
      readCursors: {},
    } as any);
    useNotificationStore.getState().setDMUnread(other, 1);

    renderHook(() => useReadTracker(null));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().dmUnreads[other]).toBeUndefined();
    expect(useDMStore.getState().readCursors[other]).toBeGreaterThan(0);
  });

  it('does NOT emit when tab is hidden', () => {
    const other = 'bb'.repeat(32);
    useDMStore.setState({
      activeDMPubkey: other,
      messages: [{ id: 'd1' }] as any,
      threads: [{ pubkey: other, displayName: 'x', unreadCount: 2 }],
    } as any);
    useNotificationStore.getState().setDMUnread(other, 2);

    const { rerender } = renderHook(() => useReadTracker(socket as any));
    act(() => {
      setVisible(false);
      rerender();
      vi.advanceTimersByTime(300);
    });

    expect(socket.emit).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().dmUnreads[other]).toBe(2);
    expect(broadcast.postClearDM).not.toHaveBeenCalled();
  });
});
