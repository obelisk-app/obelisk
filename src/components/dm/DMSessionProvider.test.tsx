import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { DMSessionProvider, useDMSession } from './DMSessionProvider';

const subscribeLiveMock = vi.fn((_opts?: unknown) => () => {});
vi.mock('@/lib/dm/dm', () => ({
  subscribeLive: (opts: any) => subscribeLiveMock(opts),
  loadHistory: vi.fn(),
  sendDM: vi.fn(),
}));

vi.mock('@/lib/dm/follows', () => ({
  hydrateFollows: vi.fn(),
}));

vi.mock('@/lib/dm/cache-key', () => ({
  getOrCreateCacheKey: vi.fn().mockResolvedValue({} as CryptoKey),
}));

vi.mock('@/lib/nostr', () => ({
  getNDK: () => ({
    signer: { pubkey: 'a'.repeat(64), nip44Encrypt: vi.fn(), nip44Decrypt: vi.fn() },
    pool: { relays: new Map([['wss://r1', {}]]) },
  }),
}));

beforeEach(() => {
  subscribeLiveMock.mockClear();
});

describe('DMSessionProvider', () => {
  it('opens a live subscription on mount with the current pubkey', () => {
    render(
      <DMSessionProvider myPubkey={'a'.repeat(64)}>
        <div />
      </DMSessionProvider>
    );
    expect(subscribeLiveMock).toHaveBeenCalledWith(expect.objectContaining({ myPubkey: 'a'.repeat(64) }));
  });

  it('closes the subscription on unmount', () => {
    const close = vi.fn();
    subscribeLiveMock.mockImplementationOnce(() => close);
    const { unmount } = render(
      <DMSessionProvider myPubkey={'a'.repeat(64)}>
        <div />
      </DMSessionProvider>
    );
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
