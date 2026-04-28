import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveLightningAddress, requestInvoice } from './lnurl-pay';

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('resolveLightningAddress', () => {
  it('resolves alice@host to https://host/.well-known/lnurlp/alice', async () => {
    const params = {
      callback: 'https://host/lnurlp/cb',
      minSendable: 1000,
      maxSendable: 10_000_000_000,
      tag: 'payRequest',
      metadata: '[]',
    };
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => params });
    const r = await resolveLightningAddress('alice@host');
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://host/.well-known/lnurlp/alice');
    expect(r).toEqual(params);
  });

  it('throws on malformed address (no @)', async () => {
    await expect(resolveLightningAddress('alicehost')).rejects.toThrow(/lightning address/i);
  });

  it('throws on http error', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(resolveLightningAddress('alice@host')).rejects.toThrow(/lnurl/i);
  });
});

describe('requestInvoice', () => {
  it('GETs callback?amount=<msat> and returns invoice', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pr: 'lnbc100u...', routes: [] }),
    });
    const r = await requestInvoice('https://host/cb', 100_000);
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://host/cb?amount=100000');
    expect(r.invoice).toBe('lnbc100u...');
  });

  it('forwards optional comment as &comment=...', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ pr: 'lnbc...' }) });
    await requestInvoice('https://host/cb', 1000, 'gracias');
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('amount=1000');
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('comment=gracias');
  });

  it('forwards optional zap-request nostr event as &nostr=<encoded>', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ pr: 'lnbc...' }) });
    const zapReq = { kind: 9734, tags: [], content: '', pubkey: 'pk', sig: 's', id: 'i', created_at: 1 };
    await requestInvoice('https://host/cb', 1000, undefined, zapReq);
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toContain('nostr=');
  });

  it('throws if response has no invoice', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ERROR', reason: 'no liquidity' }) });
    await expect(requestInvoice('https://host/cb', 1000)).rejects.toThrow(/no liquidity|invoice/i);
  });
});
