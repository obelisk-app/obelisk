import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { parsePubkeyInput } from '@/utils/identity/parse-pubkey';

describe('parsePubkeyInput', () => {
  const hex = 'ab'.repeat(32);

  it('accepts hex (any case, padded), npub and nprofile', () => {
    expect(parsePubkeyInput(` ${hex.toUpperCase()} `)).toBe(hex);
    expect(parsePubkeyInput(nip19.npubEncode(hex))).toBe(hex);
    expect(parsePubkeyInput(nip19.nprofileEncode({ pubkey: hex }))).toBe(hex);
  });

  it('a name, a broken npub or a secret key is null', () => {
    expect(parsePubkeyInput('bob')).toBeNull();
    expect(parsePubkeyInput('npub1broken')).toBeNull();
    expect(parsePubkeyInput(nip19.nsecEncode(new Uint8Array(32).fill(1)))).toBeNull();
  });
});
