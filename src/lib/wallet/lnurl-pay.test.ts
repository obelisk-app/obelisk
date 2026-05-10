// Regression tests for the SDK's NIP-57 LNURL-pay helpers. Lives in obelisk
// because the SDK package has no test suite yet, and obelisk is the primary
// consumer.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchLnurlPayMetadata, requestZapInvoice } from '@nostr-wot/wallet';
import type { NostrSigner } from '@nostr-wot/signers';

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('fetchLnurlPayMetadata', () => {
  it('resolves alice@host to https://host/.well-known/lnurlp/alice', async () => {
    const params = {
      callback: 'https://host/lnurlp/cb',
      minSendable: 1000,
      maxSendable: 10_000_000_000,
      tag: 'payRequest',
      metadata: '[]',
      allowsNostr: true,
      nostrPubkey: 'pk',
    };
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => params });
    const r = await fetchLnurlPayMetadata('alice@host');
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://host/.well-known/lnurlp/alice');
    expect(r).toEqual(params);
  });

  it('returns null on malformed address (no @)', async () => {
    expect(await fetchLnurlPayMetadata('alicehost')).toBeNull();
  });

  it('returns null on http error', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await fetchLnurlPayMetadata('alice@host')).toBeNull();
  });
});

describe('requestZapInvoice', () => {
  const fakeSigner: NostrSigner = {
    getPublicKey: vi.fn(async () => 'sender_pub'),
    signEvent: vi.fn(async (template) => ({
      ...template,
      pubkey: 'sender_pub',
      id: 'evt_id',
      sig: 'sig_hex',
    })),
  };

  it('resolves lud16, builds zap-request, and returns invoice from callback', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: 'https://host/lnurlp/cb',
          minSendable: 1000,
          maxSendable: 10_000_000_000,
          tag: 'payRequest',
          metadata: '[]',
          allowsNostr: true,
          nostrPubkey: 'provider_pub',
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pr: 'lnbc100u...' }) });
    const r = await requestZapInvoice(fakeSigner, {
      lud16: 'alice@host',
      recipientPubkey: 'recipient_pub',
      amountMsats: 100_000,
      relays: ['wss://r'],
    });
    expect(r.invoice).toBe('lnbc100u...');
    expect(r.zapRequest.kind).toBe(9734);
    const cbUrl = (globalThis.fetch as any).mock.calls[1][0];
    expect(cbUrl).toContain('amount=100000');
    expect(cbUrl).toContain('nostr=');
  });

  it('throws when lud16 cannot be resolved', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(
      requestZapInvoice(fakeSigner, {
        lud16: 'alice@host',
        recipientPubkey: 'r',
        amountMsats: 1000,
        relays: ['wss://r'],
      }),
    ).rejects.toThrow(/lnurl-pay/i);
  });

  it('throws when lud16 does not accept Nostr zaps', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        callback: 'https://host/cb',
        minSendable: 1,
        maxSendable: 1_000_000,
        tag: 'payRequest',
        metadata: '[]',
        allowsNostr: false,
      }),
    });
    await expect(
      requestZapInvoice(fakeSigner, {
        lud16: 'alice@host',
        recipientPubkey: 'r',
        amountMsats: 1000,
        relays: ['wss://r'],
      }),
    ).rejects.toThrow(/nostr zaps/i);
  });

  it('throws when callback returns no invoice', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: 'https://host/cb',
          minSendable: 1,
          maxSendable: 1_000_000,
          tag: 'payRequest',
          metadata: '[]',
          allowsNostr: true,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ERROR', reason: 'no liquidity' }) });
    await expect(
      requestZapInvoice(fakeSigner, {
        lud16: 'alice@host',
        recipientPubkey: 'r',
        amountMsats: 1000,
        relays: ['wss://r'],
      }),
    ).rejects.toThrow(/invoice/i);
  });
});
