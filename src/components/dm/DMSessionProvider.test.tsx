import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { DMSessionProvider, useDMSession } from './DMSessionProvider';

const subscribeLiveMock = vi.fn((_opts?: unknown) => () => {});
vi.mock('@/lib/dm/dm', () => ({
  subscribeLive: (opts: any) => subscribeLiveMock(opts),
  loadHistory: vi.fn(),
  sendDM: vi.fn(),
  // The provider asks for the user's published relay lists before opening
  // the live subscription. Mock both as resolved-empty so the await chain
  // settles synchronously in tests.
  fetchMyInboxRelays: vi.fn().mockResolvedValue([]),
  fetchMyDmRelays: vi.fn().mockResolvedValue([]),
  discoverNip17Partners: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/dm/dm-cache', () => ({
  subscribeToCacheTick: vi.fn(() => () => {}),
}));

vi.mock('@/store/dm', () => ({
  useDMStore: Object.assign(
    () => ({ threads: [], setThreads: vi.fn() }),
    { getState: () => ({ threads: [], setThreads: vi.fn() }) },
  ),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: Object.assign(
    (selector: any) => (selector ? selector({ signerReady: true }) : { signerReady: true }),
    { getState: () => ({ signerReady: true }) },
  ),
}));

vi.mock('@/lib/dm/follows', () => ({
  hydrateFollows: vi.fn(),
}));

vi.mock('@/lib/dm/cache-key', () => ({
  getOrCreateCacheKey: vi.fn().mockResolvedValue({} as CryptoKey),
}));

vi.mock('@/lib/nostr', () => ({
  getExplicitRelays: () => ['wss://r1'],
  formatPubkey: (pk: string) => pk.slice(0, 8),
}));

vi.mock('@nostr-wot/data/react', () => ({
  useKEKSigner: vi.fn(() => ({
    pubkey: 'a'.repeat(64),
    nip44Encrypt: vi.fn(),
    nip44Decrypt: vi.fn(),
  })),
  useSigner: vi.fn(() => ({
    pubkey: 'a'.repeat(64),
    signEvent: vi.fn(),
    getPublicKey: async () => 'a'.repeat(64),
  })),
}));

beforeEach(() => {
  subscribeLiveMock.mockClear();
});

describe('DMSessionProvider', () => {
  it('opens a live subscription on mount with the current pubkey', async () => {
    render(
      <DMSessionProvider myPubkey={'a'.repeat(64)}>
        <div />
      </DMSessionProvider>
    );
    // The provider awaits fetchMyInboxRelays + fetchMyDmRelays before
    // calling subscribeLive — flush microtasks so the await chain settles.
    await new Promise((r) => setTimeout(r, 0));
    expect(subscribeLiveMock).toHaveBeenCalledWith(expect.objectContaining({ myPubkey: 'a'.repeat(64) }));
  });

  it('closes the subscription on unmount', async () => {
    const close = vi.fn();
    subscribeLiveMock.mockImplementationOnce(() => close);
    const { unmount } = render(
      <DMSessionProvider myPubkey={'a'.repeat(64)}>
        <div />
      </DMSessionProvider>
    );
    await new Promise((r) => setTimeout(r, 0));
    unmount();
    expect(close).toHaveBeenCalled();
  });

  it('useDMSession throws outside the provider', () => {
    function Probe() { useDMSession(); return null; }
    // Suppress React error log noise from the expected throw.
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow();
    } finally {
      console.error = originalError;
    }
  });
});
