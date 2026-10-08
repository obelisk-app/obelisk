import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { allFilled, filled, isRelayAddress, parseMemberKey, sameValues, trimmedValues } from '@/utils/common/form-rules';

const HEX = 'ab'.repeat(32);

describe('form rules', () => {
  it('filled ignores spaces', () => {
    expect(filled('  ')).toBe(false);
    expect(filled(' a ')).toBe(true);
    expect(allFilled('a', 'b')).toBe(true);
    expect(allFilled('a', ' ')).toBe(false);
  });

  it('isRelayAddress follows the relay input rule', () => {
    expect(isRelayAddress('relay.example')).toBe(true);
    expect(isRelayAddress('wss://')).toBe(false);
    expect(isRelayAddress('')).toBe(false);
  });

  it('parseMemberKey takes an npub or 64 hex characters, lowercased', () => {
    expect(parseMemberKey(` ${nip19.npubEncode(HEX)} `)).toEqual({ ok: true, hex: HEX });
    expect(parseMemberKey(HEX.toUpperCase())).toEqual({ ok: true, hex: HEX });
    expect(parseMemberKey('npub1broken')).toEqual({ ok: false, problem: 'notNpub' });
    expect(parseMemberKey('alice')).toEqual({ ok: false, problem: 'notKey' });
    // An nprofile is not taken here: the member field never took one.
    expect(parseMemberKey(nip19.nprofileEncode({ pubkey: HEX }))).toEqual({ ok: false, problem: 'notKey' });
  });

  it('trimmedValues trims text and leaves the rest', () => {
    expect(trimmedValues({ a: ' x ', b: 2, c: true })).toEqual({ a: 'x', b: 2, c: true });
  });
});

describe('sameValues', () => {
  it('compares field by field', () => {
    const file = new File(['x'], 'a');
    expect(sameValues({ a: '1', f: file }, { a: '1', f: file })).toBe(true);
    expect(sameValues({ a: '1' }, { a: '2' })).toBe(false);
    expect(sameValues({ a: '1' }, { a: '1', b: '' })).toBe(false);
  });
});
