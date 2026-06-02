/**
 * Regression tests for {@link useIsRehydrating} — the hook that hides the
 * LoginModal during the cold-load window where a stored session is being
 * reconnected (relay handshake / NIP-46 bunker pre-warm) but `isLoggedIn`
 * hasn't flipped to `true` yet.
 *
 * The bug this guards against: navigating from the landing page back to /app
 * showed the LoginModal even though the user had a valid persisted session.
 * See `docs/data-system.md` §3 for the contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const SESSION_KEY = 'obelisk-dex/session';
const LEGACY_SESSION_KEY = 'obeliskord/session';

let mockLoggedIn = false;
const subscribers = new Set<(v: boolean) => void>();
let dmSubscribeCalls = 0;
let dmUnsubscribeCalls = 0;
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

function setMockLoggedIn(v: boolean) {
  mockLoggedIn = v;
  subscribers.forEach((cb) => cb(v));
}

vi.mock('./client', () => {
  return {
    getBridge: () =>
      Promise.resolve({
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
      }),
  };
});

import { setPreference } from '@/lib/preferences';
import { useDirectMessages, useIsRehydrating } from './stores';

beforeEach(() => {
  mockLoggedIn = false;
  dmSubscribeCalls = 0;
  dmUnsubscribeCalls = 0;
  subscribers.clear();
  window.localStorage.clear();
  setPreference('directMessagesEnabled', false);
});

afterEach(() => {
  subscribers.clear();
});

describe('useDirectMessages', () => {
  it('does not subscribe to relay DMs until local opt-in is enabled', async () => {
    const { result } = renderHook(() => useDirectMessages());

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

describe('useIsRehydrating', () => {
  it('returns false when there is no stored session', async () => {
    const { result } = renderHook(() => useIsRehydrating());
    // After mount, the localStorage check resolves; without a session, no
    // rehydration is in flight.
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('returns true when a session exists and isLoggedIn is still false', async () => {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        pubKeyHex: 'a'.repeat(64),
        loginMethod: 'nsec',
        relayUrl: 'wss://relay.example.com',
      }),
    );
    const { result } = renderHook(() => useIsRehydrating());
    // Initial render is `false` (mounted gate hasn't flipped yet); after the
    // mount effect lands we observe the rehydrating window.
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false once isLoggedIn flips to true (session active)', async () => {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ pubKeyHex: 'a'.repeat(64), loginMethod: 'nsec', relayUrl: 'wss://r' }),
    );
    const { result } = renderHook(() => useIsRehydrating());
    await waitFor(() => expect(result.current).toBe(true));

    act(() => setMockLoggedIn(true));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('returns false on logout (session cleared, isLoggedIn back to false)', async () => {
    // Start fully logged in.
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ pubKeyHex: 'a'.repeat(64), loginMethod: 'nsec', relayUrl: 'wss://r' }),
    );
    mockLoggedIn = true;
    const { result } = renderHook(() => useIsRehydrating());
    await waitFor(() => expect(result.current).toBe(false));

    // Simulate logout: storage is cleared *before* isLoggedIn flips to false
    // (matches BridgeImpl.logout sequencing). The hook must NOT briefly latch
    // into a "rehydrating" state — otherwise the user would see the chat
    // shell flash back instead of the LoginModal after clicking Logout.
    act(() => {
      window.localStorage.removeItem(SESSION_KEY);
      setMockLoggedIn(false);
    });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('also picks up the legacy storage key', async () => {
    window.localStorage.setItem(
      LEGACY_SESSION_KEY,
      JSON.stringify({ pubKeyHex: 'a'.repeat(64), loginMethod: 'nsec', relayUrl: 'wss://r' }),
    );
    const { result } = renderHook(() => useIsRehydrating());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
