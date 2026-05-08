import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// We mock the bridge hooks so the test can drive what messages the
// auto-mark hook sees, without spinning up the real SimplePool.
const mockState = {
  dmsByPeer: {} as Record<string, { id: string; counterparty: string; outgoing: boolean; content: string; createdAt: number }[]>,
  channelMessages: {} as Record<string, { id: string; pubkey: string; content: string; createdAt: number; kind: number; replyToId: string | null }[]>,
};

vi.mock('@/lib/nostr-bridge', () => ({
  useDirectMessages: () => mockState.dmsByPeer,
  useMessages: (groupId: string | null) =>
    (groupId ? mockState.channelMessages[groupId] ?? [] : []),
}));

import { useAutoMarkRead } from './useAutoMarkRead';
import { useDMStore } from '@/store/dm';
import { useChatStore } from '@/store/chat';
import { useReadStateStore, READ_STATE_INITIAL } from '@/store/read-state';

function setVisible(visible: boolean): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (visible ? 'visible' : 'hidden'),
  });
  // hasFocus is a method, not a getter — replace the function.
  document.hasFocus = () => visible;
}

describe('useAutoMarkRead', () => {
  beforeEach(() => {
    mockState.dmsByPeer = {};
    mockState.channelMessages = {};
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
    useDMStore.setState({
      isDMMode: false,
      activeDMPubkey: null,
      threads: [],
      messages: [],
      isLoadingMessages: false,
      isLoadingThreads: false,
      hasMoreHistory: false,
      protocolOverrides: {},
      showProtocolPrompt: null,
    });
    useChatStore.setState({ activeChannelId: null, isNearBottom: true } as any);
    setVisible(true);
  });

  afterEach(() => {
    setVisible(true);
  });

  it('advances the DM cursor to the latest message when watching', () => {
    mockState.dmsByPeer = {
      alice: [
        { id: 'a', counterparty: 'alice', outgoing: false, content: 'hi', createdAt: 100 },
        { id: 'b', counterparty: 'alice', outgoing: false, content: 'hi', createdAt: 200 },
      ],
    };
    useDMStore.setState({ activeDMPubkey: 'alice' });

    renderHook(() => useAutoMarkRead());

    // Cursor should advance to 200 sec * 1000 = 200_000 ms.
    expect(useReadStateStore.getState().dmCursors['alice']).toBe(200_000);
  });

  it('does not advance the DM cursor when the tab is hidden', () => {
    mockState.dmsByPeer = {
      alice: [
        { id: 'a', counterparty: 'alice', outgoing: false, content: 'hi', createdAt: 100 },
      ],
    };
    useDMStore.setState({ activeDMPubkey: 'alice' });
    setVisible(false);

    renderHook(() => useAutoMarkRead());

    expect(useReadStateStore.getState().dmCursors['alice']).toBeUndefined();
  });

  it('catches up the cursor when the tab regains focus', () => {
    mockState.dmsByPeer = {
      alice: [
        { id: 'a', counterparty: 'alice', outgoing: false, content: 'hi', createdAt: 100 },
      ],
    };
    useDMStore.setState({ activeDMPubkey: 'alice' });
    setVisible(false);

    renderHook(() => useAutoMarkRead());
    expect(useReadStateStore.getState().dmCursors['alice']).toBeUndefined();

    act(() => {
      setVisible(true);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(useReadStateStore.getState().dmCursors['alice']).toBe(100_000);
  });

  it('cursor is monotonic — does not regress when older messages arrive', () => {
    mockState.dmsByPeer = {
      alice: [
        { id: 'a', counterparty: 'alice', outgoing: false, content: 'hi', createdAt: 500 },
      ],
    };
    useDMStore.setState({ activeDMPubkey: 'alice' });

    const { rerender } = renderHook(() => useAutoMarkRead());
    expect(useReadStateStore.getState().dmCursors['alice']).toBe(500_000);

    // A backfill of an older message should not push the cursor backwards.
    mockState.dmsByPeer = {
      alice: [
        { id: 'a', counterparty: 'alice', outgoing: false, content: 'hi', createdAt: 100 },
      ],
    };
    rerender();

    expect(useReadStateStore.getState().dmCursors['alice']).toBe(500_000);
  });

  it('advances the channel cursor when watching + nearBottom', () => {
    mockState.channelMessages = {
      g1: [
        { id: 'a', pubkey: 'someone', content: 'hi', createdAt: 50, kind: 9, replyToId: null },
        { id: 'b', pubkey: 'someone', content: 'hi', createdAt: 150, kind: 9, replyToId: null },
      ],
    };
    useChatStore.setState({ activeChannelId: 'g1', isNearBottom: true } as any);

    renderHook(() => useAutoMarkRead());

    expect(useReadStateStore.getState().groupCursors['g1']).toBe(150_000);
  });

  it('does not advance the channel cursor when scrolled up', () => {
    mockState.channelMessages = {
      g1: [
        { id: 'a', pubkey: 'someone', content: 'hi', createdAt: 50, kind: 9, replyToId: null },
      ],
    };
    useChatStore.setState({ activeChannelId: 'g1', isNearBottom: false } as any);

    renderHook(() => useAutoMarkRead());

    expect(useReadStateStore.getState().groupCursors['g1']).toBeUndefined();
  });
});
