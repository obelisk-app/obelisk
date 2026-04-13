import { describe, it, expect, vi, afterEach } from 'vitest';
import { BOTS, botDef, isBotType, botPubkey, isBotPubkey } from './registry';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockYadio(body: any) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('bot registry', () => {
  it('isBotType recognizes only known types', () => {
    expect(isBotType('btc-usd')).toBe(true);
    expect(isBotType('sats-ars')).toBe(true);
    expect(isBotType('dolar-ars')).toBe(true);
    expect(isBotType('nope')).toBe(false);
    expect(botDef('nope')).toBeNull();
  });

  it('botPubkey / isBotPubkey round-trip', () => {
    const pk = botPubkey('abc123');
    expect(pk).toBe('bot:abc123');
    expect(isBotPubkey(pk)).toBe(true);
    expect(isBotPubkey('64hex...')).toBe(false);
  });

  it('btc-usd formats integer USD with thousands separator', async () => {
    mockYadio({ BTC: 63412.78, USD: 1 });
    const value = await BOTS['btc-usd'].fetchValue();
    expect(value).toBe('BTC $63,413');
  });

  it('btc-usd throws on missing/invalid price', async () => {
    mockYadio({});
    await expect(BOTS['btc-usd'].fetchValue()).rejects.toThrow();
    mockYadio({ BTC: 0 });
    await expect(BOTS['btc-usd'].fetchValue()).rejects.toThrow();
  });

  it('sats-ars derives sats/ARS from BTC/ARS and formats 2 decimals', async () => {
    // 1 BTC = 100,000,000 ARS => 1 sat = 1.00 ARS
    mockYadio({ BTC: 100_000_000 });
    const value = await BOTS['sats-ars'].fetchValue();
    expect(value).toContain('1 sat =');
    // es-AR uses comma decimal sep; accept either "1,00" or "1.00"
    expect(value).toMatch(/1[.,]00/);
  });

  it('dolar-ars reads USD field', async () => {
    mockYadio({ USD: 1020, BTC: 100_000_000 });
    const value = await BOTS['dolar-ars'].fetchValue();
    expect(value.startsWith('USD ')).toBe(true);
    expect(value).toMatch(/1[.,]020/);
  });

  it('HTTP errors surface as thrown errors', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    await expect(BOTS['btc-usd'].fetchValue()).rejects.toThrow(/HTTP 500/);
  });
});
