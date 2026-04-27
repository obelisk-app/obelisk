import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/wallet/local-store', () => ({
  hasLocalWallet: vi.fn(),
  readLocalWallet: vi.fn(),
  saveLocalWallet: vi.fn(),
  clearLocalWallet: vi.fn(),
}));
vi.mock('@/lib/wallet/local-client', () => ({
  useLocalWallet: vi.fn(() => ({ client: null, loading: false, error: null, reload: vi.fn(), disconnect: vi.fn() })),
}));
vi.mock('@/lib/wallet/provisioning', () => ({
  provisionWallet: vi.fn(),
  claimLightningAddress: vi.fn(),
  getLightningAddress: vi.fn().mockResolvedValue(null),
  releaseLightningAddress: vi.fn(),
  PROVISION_URL: 'https://zaps.nostr-wot.com',
}));
vi.mock('@/lib/wallet/lnbits-to-nwc', () => ({ lnbitsToNwc: vi.fn() }));
vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn((selector?: any) => {
    const state = { profile: { pubkey: 'npub_me' }, signerReady: true };
    return selector ? selector(state) : state;
  }),
}));
vi.mock('@/lib/nostr', () => ({
  getNDK: vi.fn(() => ({
    signer: {
      pubkey: 'npub_me',
      nip44Encrypt: async () => 'enc',
      nip44Decrypt: async () => 'dec',
      getPublicKey: async () => 'npub_me',
      signEvent: async (t: any) => ({ ...t, id: 'i', sig: 's', pubkey: 'npub_me' }),
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }); // legacy-export 404
});

import WalletPanel from './WalletPanel';

describe('WalletPanel — connect screen', () => {
  it('renders three connect tabs when no wallet exists', async () => {
    const { hasLocalWallet } = await import('@/lib/wallet/local-store');
    (hasLocalWallet as any).mockReturnValue(false);
    render(<WalletPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Quick Setup/i)).toBeInTheDocument();
      expect(screen.getByText(/^NWC$/)).toBeInTheDocument();
      expect(screen.getByText(/LNbits/)).toBeInTheDocument();
    });
  });

  it('Quick Setup → click button calls provisionWallet then saveLocalWallet', async () => {
    const { hasLocalWallet, saveLocalWallet } = await import('@/lib/wallet/local-store');
    const { provisionWallet } = await import('@/lib/wallet/provisioning');
    (hasLocalWallet as any).mockReturnValue(false);
    (provisionWallet as any).mockResolvedValue({ nwcUri: 'nostr+walletconnect://abc', walletId: 'w1', adminKey: 'ak' });
    render(<WalletPanel />);
    await waitFor(() => screen.getByText(/Crear billetera/i));
    fireEvent.click(screen.getByText(/Crear billetera/i));
    await waitFor(() => {
      expect(provisionWallet).toHaveBeenCalled();
      expect(saveLocalWallet).toHaveBeenCalled();
    });
  });

  it('renders <PoweredByNostrWot /> on the connect screen', async () => {
    const { hasLocalWallet } = await import('@/lib/wallet/local-store');
    (hasLocalWallet as any).mockReturnValue(false);
    render(<WalletPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
    });
  });
});

describe('WalletPanel — auto-migration', () => {
  it('hits legacy-export on mount and saves locally on success', async () => {
    const { hasLocalWallet, saveLocalWallet } = await import('@/lib/wallet/local-store');
    (hasLocalWallet as any).mockReturnValue(false);
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ nwcUri: 'nostr+walletconnect://migrated', label: 'Alby' }),
    });
    render(<WalletPanel />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/wallet/legacy-export');
      expect(saveLocalWallet).toHaveBeenCalled();
    });
  });

  it('does NOT hit legacy-export when local wallet already exists', async () => {
    const { hasLocalWallet } = await import('@/lib/wallet/local-store');
    (hasLocalWallet as any).mockReturnValue(true);
    render(<WalletPanel />);
    // Wait a tick for any pending effects
    await new Promise(r => setTimeout(r, 50));
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/wallet/legacy-export');
  });
});
