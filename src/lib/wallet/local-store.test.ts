import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _resetCacheKeyState } from '@/lib/dm/cache-key';
import {
  saveLocalWallet, readLocalWallet, clearLocalWallet, hasLocalWallet,
  type LocalWallet,
} from './local-store';

const PUBKEY = 'npub_test_user';

const fakeSigner = {
  pubkey: PUBKEY,
  nip44Encrypt: vi.fn(async (_recipient: string, plaintext: string) => `wrapped:${plaintext}`),
  nip44Decrypt: vi.fn(async (_sender: string, ciphertext: string) =>
    ciphertext.startsWith('wrapped:') ? ciphertext.slice(8) : '',
  ),
};

beforeEach(() => {
  _resetCacheKeyState();
  globalThis.localStorage.clear();
});

describe('local-store', () => {
  it('round-trips a wallet (save → read)', async () => {
    const wallet: LocalWallet = {
      source: 'quick',
      nwcUri: 'nostr+walletconnect://abc',
      label: 'nostr-wot',
    };
    await saveLocalWallet(PUBKEY, fakeSigner, wallet);
    expect(hasLocalWallet(PUBKEY)).toBe(true);
    const loaded = await readLocalWallet(PUBKEY, fakeSigner);
    expect(loaded).toEqual(wallet);
  });

  it('readLocalWallet returns null when nothing stored', async () => {
    expect(await readLocalWallet(PUBKEY, fakeSigner)).toBeNull();
    expect(hasLocalWallet(PUBKEY)).toBe(false);
  });

  it('clearLocalWallet removes entry', async () => {
    await saveLocalWallet(PUBKEY, fakeSigner, { source: 'nwc', nwcUri: 'nostr+walletconnect://x' });
    await clearLocalWallet(PUBKEY);
    expect(hasLocalWallet(PUBKEY)).toBe(false);
    expect(await readLocalWallet(PUBKEY, fakeSigner)).toBeNull();
  });

  it('isolates wallets per pubkey', async () => {
    await saveLocalWallet(PUBKEY, fakeSigner, { source: 'quick', nwcUri: 'A' });
    await saveLocalWallet('npub_other', { ...fakeSigner, pubkey: 'npub_other' } as any, { source: 'nwc', nwcUri: 'B' });
    const a = await readLocalWallet(PUBKEY, fakeSigner);
    expect(a?.nwcUri).toBe('A');
  });

  it('preserves all LocalWallet fields including lnbitsInstance', async () => {
    const wallet: LocalWallet = {
      source: 'lnbits',
      nwcUri: 'nostr+walletconnect://lnbits-converted',
      label: 'My LNbits',
      lnbitsInstance: 'https://my.lnbits.test',
    };
    await saveLocalWallet(PUBKEY, fakeSigner, wallet);
    const loaded = await readLocalWallet(PUBKEY, fakeSigner);
    expect(loaded).toEqual(wallet);
  });
});
