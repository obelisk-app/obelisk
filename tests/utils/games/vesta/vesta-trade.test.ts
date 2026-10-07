import { describe, expect, it } from 'vitest';
import { bankRatesText, tradePartners, TRADE_TAKE_MAX } from '@/utils/games/vesta/vesta-trade';

describe('tradePartners', () => {
  it('is every seat but the acting one, with its player number', () => {
    expect(tradePartners(['a', 'b', 'c'], 1)).toEqual([{ seat: 'a', index: 0 }, { seat: 'c', index: 2 }]);
    expect(tradePartners(['a', 'b'], -1)).toHaveLength(2);
  });
});

describe('bankRatesText', () => {
  it('lists each resource at its rate', () => {
    expect(bankRatesText({ brick: 2, lumber: 3, wool: 4, grain: 4, ore: 4 })).toBe('🧱2:1  🪵3:1  🐑4:1  🌾4:1  🪨4:1');
  });
});

describe('TRADE_TAKE_MAX', () => {
  it('is the bank stock of one resource', () => {
    expect(TRADE_TAKE_MAX).toBe(19);
  });
});
