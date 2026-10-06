import { beforeEach, describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { decodeNpub, loadHistory, pushHistory, wipeHistory } from '@/hooks/chat/relay-search/search-history';

describe('decodeNpub', () => {
  const hex = 'cd'.repeat(32);
  it('accepts hex, npub and nprofile', () => {
    expect(decodeNpub(hex.toUpperCase())).toBe(hex);
    expect(decodeNpub(nip19.npubEncode(hex))).toBe(hex);
    expect(decodeNpub(nip19.nprofileEncode({ pubkey: hex }))).toBe(hex);
  });
  it('a name or a broken npub is null', () => {
    expect(decodeNpub('alice')).toBeNull();
    expect(decodeNpub('npub1broken')).toBeNull();
  });
});

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
