import { describe, expect, it } from 'vitest';
import { topReactors, topZappers } from '@/utils/shell/panes/message/hover-cards';
import { HOVER_CARD_LIMIT } from '@/constants/shell/panes';

describe('topReactors', () => {
  it('keeps the reaction order and counts what it leaves out', () => {
    expect(topReactors(new Set(['a', 'b', 'c']), 2)).toEqual({ shown: ['a', 'b'], extra: 1, total: 3 });
  });

  it('caps at 20 by default', () => {
    const all = new Set(Array.from({ length: 25 }, (_, i) => `p${i}`));
    const out = topReactors(all);
    expect(HOVER_CARD_LIMIT).toBe(20);
    expect(out.shown).toHaveLength(20);
    expect(out.extra).toBe(5);
  });

  it('an empty set lists nobody', () => {
    expect(topReactors(new Set())).toEqual({ shown: [], extra: 0, total: 0 });
  });
});

describe('topZappers', () => {
  it('sorts by amount, largest first, and caps', () => {
    const out = topZappers(new Map([['a', 5], ['b', 50], ['c', 10]]), 2);
    expect(out.shown).toEqual([['b', 50], ['c', 10]]);
    expect(out.extra).toBe(1);
    expect(out.total).toBe(3);
  });
});
