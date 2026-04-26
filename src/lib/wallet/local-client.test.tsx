import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/wallet/local-store', () => ({
  hasLocalWallet: vi.fn(),
  readLocalWallet: vi.fn(),
  clearLocalWallet: vi.fn(),
}));
vi.mock('@getalby/sdk', () => ({
  NWCClient: vi.fn().mockImplementation((opts) => ({
    nostrWalletConnectUrl: opts.nostrWalletConnectUrl,
    close: vi.fn(),
  })),
}));

const fakeSigner = {
  pubkey: 'npub_me',
  nip44Encrypt: async () => 'enc',
  nip44Decrypt: async () => 'dec',
};

import { useLocalWallet } from './local-client';
import * as store from '@/lib/wallet/local-store';

describe('useLocalWallet', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('returns null client when no wallet stored', async () => {
    (store.hasLocalWallet as any).mockReturnValue(false);
    const { result } = renderHook(() => useLocalWallet('npub_me', fakeSigner));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.client).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('decrypts and instantiates NWCClient when wallet exists', async () => {
    (store.hasLocalWallet as any).mockReturnValue(true);
    (store.readLocalWallet as any).mockResolvedValue({ source: 'quick', nwcUri: 'nostr+walletconnect://test' });
    const { result } = renderHook(() => useLocalWallet('npub_me', fakeSigner));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(result.current.client).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('disconnect clears the local wallet and resets client', async () => {
    (store.hasLocalWallet as any).mockReturnValueOnce(true).mockReturnValue(false);
    (store.readLocalWallet as any).mockResolvedValue({ source: 'quick', nwcUri: 'nostr+walletconnect://test' });
    const { result } = renderHook(() => useLocalWallet('npub_me', fakeSigner));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { await result.current.disconnect(); });
    expect(store.clearLocalWallet).toHaveBeenCalledWith('npub_me');
    expect(result.current.client).toBeNull();
  });

  it('returns null when pubkey is null', async () => {
    const { result } = renderHook(() => useLocalWallet(null, fakeSigner));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.client).toBeNull();
  });

  it('returns null when signer is null', async () => {
    (store.hasLocalWallet as any).mockReturnValue(true);
    const { result } = renderHook(() => useLocalWallet('npub_me', null));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.client).toBeNull();
  });
});
