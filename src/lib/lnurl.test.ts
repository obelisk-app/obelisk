import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isLightningAddress, resolveLightningAddress } from './lnurl';

describe('isLightningAddress', () => {
  it('accepts standard addresses', () => {
    expect(isLightningAddress('alice@getalby.com')).toBe(true);
    expect(isLightningAddress('user.name+tag@sub.example.co')).toBe(false); // + not allowed by regex
    expect(isLightningAddress('bob_1-2.test@walletofsatoshi.com')).toBe(true);
  });

  it('rejects non-addresses', () => {
    expect(isLightningAddress('lnbc1...')).toBe(false);
    expect(isLightningAddress('not-an-address')).toBe(false);
    expect(isLightningAddress('foo@bar')).toBe(false);
  });
});

describe('resolveLightningAddress', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('resolves address → callback → invoice', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('.well-known/lnurlp/alice')) {
        return new Response(JSON.stringify({
          tag: 'payRequest',
          callback: 'https://example.com/cb',
          minSendable: 1000,
          maxSendable: 100000000,
          commentAllowed: 50,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ pr: 'lnbc1testinvoice' }), { status: 200 });
    }) as typeof fetch;

    const inv = await resolveLightningAddress('alice@example.com', 100, 'gracias');
    expect(inv).toBe('lnbc1testinvoice');
    expect(calls[0]).toBe('https://example.com/.well-known/lnurlp/alice');
    expect(calls[1]).toContain('amount=100000');
    expect(calls[1]).toContain('comment=gracias');
  });

  it('throws on out-of-range amount', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      tag: 'payRequest', callback: 'https://x/cb', minSendable: 10000, maxSendable: 20000,
    }), { status: 200 })) as typeof fetch;
    await expect(resolveLightningAddress('a@b.com', 1)).rejects.toThrow('amount_out_of_range');
  });

  it('throws when callback has no invoice', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n++;
      if (n === 1) return new Response(JSON.stringify({
        tag: 'payRequest', callback: 'https://x/cb', minSendable: 1000, maxSendable: 100000,
      }), { status: 200 });
      return new Response(JSON.stringify({ status: 'ERROR', reason: 'nope' }), { status: 200 });
    }) as typeof fetch;
    await expect(resolveLightningAddress('a@b.com', 10)).rejects.toThrow('nope');
  });
});
