import { describe, expect, it } from 'vitest';
import type { JsMediaPack } from '@/services/nostr-bridge';
import { filterVisiblePacks, newPack, sortedPacks, uniqueName, validHttpUrl } from '@/components/media/library/pack-utils';

const pack = (address: string, overrides: Partial<JsMediaPack> = {}): JsMediaPack => ({
  address,
  identifier: address,
  author: 'alice',
  title: address,
  description: '',
  image: '',
  createdAt: 1,
  items: [{ name: 'cat', url: 'https://x/cat.png', kind: 'sticker' }],
  ...overrides,
} as JsMediaPack);

describe('uniqueName', () => {
  it('suffixes a taken shortcode and remembers the result', () => {
    const used = new Set(['party_cat']);
    expect(uniqueName('party cat.png', used)).not.toBe('party_cat');
    const second = uniqueName('party cat.png', used);
    expect(used.has(second)).toBe(true);
  });

  it('falls back to "media" for a name with nothing usable', () => {
    expect(uniqueName('!!!', new Set())).toBe('media');
  });
});

describe('newPack', () => {
  it('starts empty with a fresh identifier each time', () => {
    const a = newPack();
    const b = newPack();
    expect(a.items).toEqual([]);
    expect(a.identifier).not.toBe(b.identifier);
  });
});

describe('validHttpUrl', () => {
  it('accepts http and https only', () => {
    expect(validHttpUrl('https://example.com/a.png')).toBe(true);
    expect(validHttpUrl('http://example.com/a.png')).toBe(true);
    expect(validHttpUrl('javascript:alert(1)')).toBe(false);
    expect(validHttpUrl('not a url')).toBe(false);
  });
});

describe('sortedPacks', () => {
  it('drops empty packs and puts the newest first', () => {
    const result = sortedPacks({
      old: pack('old', { createdAt: 1 }),
      fresh: pack('fresh', { createdAt: 5 }),
      empty: pack('empty', { createdAt: 9, items: [] }),
    });
    expect(result.map((p) => p.address)).toEqual(['fresh', 'old']);
  });
});

describe('filterVisiblePacks', () => {
  const packs = [
    pack('mine', { author: 'me', title: 'Cats' }),
    pack('theirs', { title: 'Dogs', items: [{ name: 'dog', url: 'https://x/d.gif', kind: 'gif' }] }),
  ];
  const base = { tab: 'discover' as const, kindFilter: 'all' as const, query: '', myPubkey: 'me', favoritePackAddresses: [] };

  it('shows only my packs under Mine', () => {
    expect(filterVisiblePacks(packs, { ...base, tab: 'mine' }).map((p) => p.address)).toEqual(['mine']);
  });

  it('shows only saved packs under Favorites', () => {
    expect(filterVisiblePacks(packs, { ...base, tab: 'favorites', favoritePackAddresses: ['theirs'] }).map((p) => p.address)).toEqual(['theirs']);
  });

  it('narrows by item kind and by text in title or item names', () => {
    expect(filterVisiblePacks(packs, { ...base, kindFilter: 'gif' }).map((p) => p.address)).toEqual(['theirs']);
    expect(filterVisiblePacks(packs, { ...base, query: '  CAT ' }).map((p) => p.address)).toEqual(['mine']);
  });
});
