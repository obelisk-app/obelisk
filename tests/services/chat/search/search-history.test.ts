import { beforeEach, describe, expect, it } from 'vitest';
import { loadHistory, pushHistory, wipeHistory } from '@/services/chat/search/search-history';

describe('search history', () => {
  beforeEach(() => localStorage.clear());

  it('pushes to the top, dedupes, ignores blanks and caps at ten', () => {
    pushHistory('a');
    pushHistory('b');
    expect(pushHistory(' a ')).toEqual(['a', 'b']);
    expect(pushHistory('   ')).toEqual(['a', 'b']);
    for (let i = 0; i < 12; i++) pushHistory(`q${i}`);
    expect(loadHistory()).toHaveLength(10);
    expect(loadHistory()[0]).toBe('q11');
  });

  it('survives junk in storage and wipes', () => {
    localStorage.setItem('obelisk-dex/search-history', '{not json');
    expect(loadHistory()).toEqual([]);
    localStorage.setItem('obelisk-dex/search-history', JSON.stringify(['x', 3, 'y']));
    expect(loadHistory()).toEqual(['x', 'y']);
    wipeHistory();
    expect(loadHistory()).toEqual([]);
  });
});
