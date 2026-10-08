import { fakeBridge } from '@tests/support/fake-bridge';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BridgeImpl } from '@/services/nostr-bridge/facade/client';
import { bridgeWrapper } from '@tests/support/render-with-bridge';


const mockLoggedIn = false;
const subscribers = new Set<(v: boolean) => void>();
let dmSubscribeCalls = 0;
let dmUnsubscribeCalls = 0;
let loadMoreMessagesMock: ReturnType<typeof vi.fn<(groupId: string) => Promise<unknown>>>;
const dmSnapshot = {
  ['b'.repeat(64)]: [
    {
      id: 'dm-1',
      counterparty: 'b'.repeat(64),
      outgoing: false,
      content: 'hello',
      createdAt: 100,
    },
  ],
};

// A hand-built instance under the real provider: no module mock.
const bridge = {
  ...fakeBridge({ isLoggedIn: false, myPubkey: null, myLoginMethod: null }),
  subscribeIsLoggedIn: (cb: (v: boolean) => void) => {
    subscribers.add(cb);
    cb(mockLoggedIn);
    return () => {
      subscribers.delete(cb);
    };
  },
  subscribeDirectMessages: (cb: (v: typeof dmSnapshot) => void) => {
    dmSubscribeCalls += 1;
    cb(dmSnapshot);
    return () => {
      dmUnsubscribeCalls += 1;
    };
  },
  loadMoreMessages: (groupId: string) => loadMoreMessagesMock(groupId),
} as unknown as BridgeImpl;
const wrapper = bridgeWrapper(bridge, { ready: false });

import { setPreference } from '@/services/preferences/preferences';
import { useDirectMessages, useLoadEarlier } from '@/services/nostr-bridge/hooks/messages';
// Rides along with the message hooks because it shares this file's fake bridge.

beforeEach(() => {
  dmSubscribeCalls = 0;
  dmUnsubscribeCalls = 0;
  loadMoreMessagesMock = vi.fn();
  subscribers.clear();
  window.localStorage.clear();
  setPreference('directMessagesEnabled', false);
});

afterEach(() => {
  subscribers.clear();
});

describe('useDirectMessages', () => {
  it('does not subscribe to relay DMs until local opt-in is enabled', async () => {
    const { result } = renderHook(() => useDirectMessages(), { wrapper });

    await Promise.resolve();
    expect(dmSubscribeCalls).toBe(0);
    expect(result.current).toEqual({});

    act(() => setPreference('directMessagesEnabled', true));
    await waitFor(() => expect(dmSubscribeCalls).toBe(1));
    expect(result.current).toEqual(dmSnapshot);

    act(() => setPreference('directMessagesEnabled', false));
    await waitFor(() => expect(result.current).toEqual({}));
    expect(dmUnsubscribeCalls).toBe(1);
  });
});

describe('useLoadEarlier', () => {
  it('marks the start reached only on a confirmed end result', async () => {
    loadMoreMessagesMock.mockResolvedValueOnce('end');
    const { result } = renderHook(() => useLoadEarlier('g1'), { wrapper });

    let loadResult: unknown = null;
    await act(async () => {
      loadResult = await result.current.loadEarlier();
    });

    expect(loadResult).toBe('end');
    expect(loadMoreMessagesMock).toHaveBeenCalledWith('g1');
    expect(result.current.loading).toBe(false);
    expect(result.current.lastResult).toBe('end');
    expect(result.current.reachedStart).toBe(true);
  });

  it('keeps pagination retryable when the bridge reports unavailable', async () => {
    loadMoreMessagesMock.mockResolvedValueOnce('unavailable');
    const { result } = renderHook(() => useLoadEarlier('g1'), { wrapper });

    let loadResult: unknown = null;
    await act(async () => {
      loadResult = await result.current.loadEarlier();
    });

    expect(loadResult).toBe('unavailable');
    expect(result.current.loading).toBe(false);
    expect(result.current.lastResult).toBe('unavailable');
    expect(result.current.reachedStart).toBe(false);
  });

  it('does not immediately retry unavailable pagination while still at the top', async () => {
    loadMoreMessagesMock.mockResolvedValue('unavailable');
    const { result } = renderHook(() => useLoadEarlier('g1'), { wrapper });

    await act(async () => {
      await result.current.loadEarlier();
    });
    let skipped: unknown = 'not-called';
    await act(async () => {
      skipped = await result.current.loadEarlier();
    });

    expect(skipped).toBeNull();
    expect(loadMoreMessagesMock).toHaveBeenCalledTimes(1);
    expect(result.current.reachedStart).toBe(false);
  });

  it('keeps pagination retryable when the bridge throws', async () => {
    loadMoreMessagesMock.mockRejectedValueOnce(new Error('relay down'));
    const { result } = renderHook(() => useLoadEarlier('g1'), { wrapper });

    await act(async () => {
      await result.current.loadEarlier();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.lastResult).toBe('unavailable');
    expect(result.current.reachedStart).toBe(false);
  });
});
