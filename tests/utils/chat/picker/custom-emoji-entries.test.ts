import { describe, expect, it } from 'vitest';
import { customEntriesFrom, filterByName, resolveRecentEntries } from '@/utils/chat/picker/custom-emoji-entries';
import { SEARCH_LIMIT } from '@/constants/chat/picker';

describe('custom emoji entries', () => {
  it('normalises names, prefers the declared kind, and sorts', () => {
    const entries = customEntriesFrom(
      { Zed: 'https://x/z.png', anim: 'https://x/a.gif', blank: '' },
      { zed: 'sticker' },
    );
    expect(entries.map((e) => [e.name, e.kind])).toEqual([['anim', 'gif'], ['zed', 'sticker']]);
  });

  it('filters by name and caps the list', () => {
    const many = Array.from({ length: SEARCH_LIMIT + 5 }, (_, i) => ({ name: `e${i}` }));
    expect(filterByName(many, '')).toHaveLength(SEARCH_LIMIT);
    expect(filterByName(many, 'e1').every((e) => e.name.includes('e1'))).toBe(true);
  });

  it('keeps unicode recents, resolves custom ones, and drops what cannot render', () => {
    const custom = customEntriesFrom({ party: 'https://x/party.png' }, {});
    const out = resolveRecentEntries(
      [{ char: '😀' }, { char: ':party:' }, { char: ':stored:', url: 'https://x/s.png', packAddress: '30030:a:b' }, { char: ':gone:' }],
      custom,
    );
    expect(out).toEqual([
      { char: '😀', custom: null },
      { char: ':party:', custom: { name: 'party', url: 'https://x/party.png' } },
      { char: ':stored:', custom: { name: 'stored', url: 'https://x/s.png', packAddress: '30030:a:b' } },
    ]);
  });
});
