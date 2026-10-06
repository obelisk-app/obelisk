import { describe, expect, it } from 'vitest';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { popoverShortNpub, profileShortNpub, stripEmpty } from '@/utils/identity/profile-labels';

const HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';

describe('stripEmpty', () => {
  it('drops null, undefined and empty-string fields', () => {
    expect(stripEmpty({ a: 'x', b: '', c: null, d: undefined, e: 0 })).toEqual({ a: 'x', e: 0 });
    expect(stripEmpty(null)).toEqual({});
  });
});

describe('short npub labels', () => {
  it('both print the shared short npub label', () => {
    const expected = shortNpubLabel(HEX);
    expect(expected).toMatch(/^npub1.{5}….{4}$/);
    expect(profileShortNpub(HEX)).toBe(expected);
    expect(popoverShortNpub(HEX)).toBe(expected);
  });

  it('the profile label falls back to trimmed text when the key does not encode', () => {
    expect(profileShortNpub('not-hex-at-all-xyz')).toBe('not-hex-at…ll-xyz');
  });
});
