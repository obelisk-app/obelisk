import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PROVISION_URL,
  provisionWallet,
  claimLightningAddress,
  getLightningAddress,
  releaseLightningAddress,
} from './provisioning';
import type { NostrSigner } from '@nostr-wot/signers';

const fakeSigner: NostrSigner = {
  getPublicKey: vi.fn().mockResolvedValue('e9b14b3c...'),
  signEvent: vi.fn().mockImplementation(async (t) => ({
    ...t,
    pubkey: 'e9b14b3c...',
    id: 'evt_id',
    sig: 'sig_hex',
  })),
};

beforeEach(() => {
  vi.resetAllMocks();
  (fakeSigner.getPublicKey as any).mockResolvedValue('e9b14b3c...');
  (fakeSigner.signEvent as any).mockImplementation(async (t: any) => ({
    ...t,
    pubkey: 'e9b14b3c...',
    id: 'evt_id',
    sig: 'sig_hex',
  }));
  globalThis.fetch = vi.fn();
});

describe('PROVISION_URL', () => {
  it('defaults to https://zaps.nostr-wot.com', () => {
    expect(PROVISION_URL).toBe('https://zaps.nostr-wot.com');
  });
});

describe('provisionWallet', () => {
  it('GETs challenge, signs, POSTs with event, returns nwcUri', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'CHAL' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'w1', adminkey: 'AK', user: 'u1', balance_msat: 0, name: 'WoT:npub_test', inkey: 'ik', nwcUri: 'nostr+walletconnect://test' }),
      });
    const res = await provisionWallet(fakeSigner);
    expect(res.nwcUri).toBe('nostr+walletconnect://test');
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://zaps.nostr-wot.com/api/provision/challenge');
    const postCall = (globalThis.fetch as any).mock.calls[1];
    expect(postCall[0]).toBe('https://zaps.nostr-wot.com/api/provision');
    const body = JSON.parse(postCall[1].body);
    expect(body.event.kind).toBe(27235);
    expect(body.event.content).toBe('CHAL');
    expect(body.name).toMatch(/^WoT:/);
  });

  it('throws on challenge fetch failure', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 502 });
    await expect(provisionWallet(fakeSigner)).rejects.toThrow(/challenge/i);
  });

  it('throws on provision POST failure with server message if present', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'CHAL' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'limit_exceeded' }) });
    await expect(provisionWallet(fakeSigner)).rejects.toThrow(/limit_exceeded|provision/i);
  });
});

describe('claimLightningAddress', () => {
  it('POSTs username + signed event, returns address', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'C' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ address: 'alice@zaps.nostr-wot.com' }) });
    const r = await claimLightningAddress(fakeSigner, 'alice');
    expect(r.address).toBe('alice@zaps.nostr-wot.com');
    const body = JSON.parse((globalThis.fetch as any).mock.calls[1][1].body);
    expect(body.username).toBe('alice');
    expect(body.event.kind).toBe(27235);
  });

  it('surfaces server-side error message on conflict', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'C' }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'already_taken' }) });
    await expect(claimLightningAddress(fakeSigner, 'alice')).rejects.toThrow(/already_taken|claim/i);
  });
});

describe('getLightningAddress', () => {
  it('returns address on hit', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ address: 'alice@zaps.nostr-wot.com' }) });
    expect(await getLightningAddress('npub_alice')).toBe('alice@zaps.nostr-wot.com');
  });
  it('returns null on miss', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false });
    expect(await getLightningAddress('npub_alice')).toBeNull();
  });
});

describe('releaseLightningAddress', () => {
  it('signs and POSTs, resolves on success', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'C' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await expect(releaseLightningAddress(fakeSigner)).resolves.toBeUndefined();
  });
});
