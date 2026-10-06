import { describe, expect, it } from 'vitest';
import { describe as describeCounts, filled, sum, tradeAction } from '@/components/chat/games/vesta/resources';

describe('vesta resource helpers', () => {
  it('fills every resource, defaulting to zero', () => {
    expect(filled({ ore: 2 })).toEqual({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 2 });
  });

  it('sums a partial hand', () => {
    expect(sum({ brick: 1, wool: 3 })).toBe(4);
    expect(sum({})).toBe(0);
  });

  it('describes a bundle, or says nothing', () => {
    expect(describeCounts({ brick: 2 })).toBe('2🧱');
    expect(describeCounts({})).toBe('nothing');
  });

  it('builds a bank trade or a proposal to a player', () => {
    expect(tradeAction('bank', { ore: 4 }, { wool: 1 })).toMatchObject({ type: 'trade', partner: 'bank' });
    expect(tradeAction(2, { ore: 1 }, { wool: 1 })).toMatchObject({ type: 'propose-trade', partner: 2 });
    expect(tradeAction(null, {}, {})).toMatchObject({ type: 'propose-trade', partner: 0 });
  });
});
