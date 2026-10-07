import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * An incoming call must never wait on a download. The listener ships with the
 * shell (`LazyDmCallLayer` -> `useDmCallListener`); the call layer it wraps,
 * and the media stack behind it, are separate downloads. Here both downloads
 * hang forever, and the call must still ring.
 */

const bridge = vi.hoisted(() => {
  const listeners = new Set<(msg: unknown) => void>();
  return {
    listeners,
    subscribeDmCallMessages: (cb: (msg: unknown) => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    subscribeDirectMessages: () => () => {},
    getPublicKey: () => 'a'.repeat(64),
    displayNameFor: () => 'Bob',
    myContactList: { get: () => ({ tags: [['p', 'b'.repeat(64)]] }) },
    sendDmCallMessage: async () => {},
  };
});
vi.mock('@/services/nostr-bridge', async (orig) => {
  const { bridgeOverrides } = await import('@tests/support/mocks/nostr-bridge');
  return {
    ...(await orig<typeof import('@/services/nostr-bridge')>()),
    ...bridgeOverrides({ useIsLoggedIn: () => true }),
    getBridge: async () => bridge,
    getBridgeImpl: () => bridge,
  };
});

const ring = vi.hoisted(() => ({ incoming: 0 }));
vi.mock('@/services/notifications/alert', () => ({
  ringIncomingCall: () => { ring.incoming++; return { stop: () => {} }; },
  startRingback: () => ({ stop: () => {} }),
}));

// Neither download ever lands.
const fetched = vi.hoisted(() => ({ layer: 0, session: 0 }));
vi.mock('@/components/call/DmCallLayer', () => {
  fetched.layer++;
  return new Promise(() => {});
});
vi.mock('@/services/call/session', () => {
  fetched.session++;
  return new Promise(() => {});
});

import { LazyDmCallLayer } from '@/app/[locale]/app/mounts/lazy-mounts';
import { LocaleProvider } from '@tests/support/intl';
import { __resetDmCallsForTests, useDmCallStore } from '@/store/call/dm-call';
import { setPreference } from '@/services/preferences/preferences';

const BOB = 'b'.repeat(64);

describe('LazyDmCallLayer', () => {
  afterEach(() => { __resetDmCallsForTests(); });

  it('listens for calls and rings while the call layer and the media stack are still downloading', async () => {
    setPreference('callsFrom', 'contacts');
    render(<LocaleProvider initialLocale="en"><LazyDmCallLayer /></LocaleProvider>);
    await vi.waitFor(() => expect(bridge.listeners.size).toBe(1));
    expect(fetched.layer).toBe(1);

    act(() => {
      for (const cb of bridge.listeners) {
        cb({ type: 'invite', callId: 'c'.repeat(64), eph: 'f'.repeat(64), relays: ['wss://call.example'], video: false, from: BOB, sentAt: Date.now() / 1000, peer: BOB });
      }
    });
    expect(ring.incoming).toBe(1);
    expect(useDmCallStore.getState()).toMatchObject({ status: 'incoming', peer: BOB });
    // Ringing started the media stack's download, so "Accept" will not wait on it.
    await vi.waitFor(() => expect(fetched.session).toBe(1));
    expect(screen.queryByTestId('dm-incoming-call')).toBeNull();
  });
});
