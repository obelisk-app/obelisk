import { describe, it, expect } from 'vitest';
import { pubkeyToNpub, npubToHex } from './nostr';

const HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const NPUB = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6';

describe('pubkeyToNpub / npubToHex', () => {
  it('round-trips a hex pubkey through npub encoding', () => {
    const npub = pubkeyToNpub(HEX);
    expect(npub).toBe(NPUB);
    expect(npubToHex(npub)).toBe(HEX);
  });

  it('accepts a raw hex pubkey and returns it lowercased', () => {
    expect(npubToHex(HEX.toUpperCase())).toBe(HEX);
  });

  it('trims surrounding whitespace before decoding', () => {
    expect(npubToHex(`   ${NPUB}  `)).toBe(HEX);
  });

  it('returns null for invalid bech32 / non-pubkey inputs', () => {
    expect(npubToHex('not-a-pubkey')).toBeNull();
    expect(npubToHex('npub1invalid')).toBeNull();
    expect(npubToHex('')).toBeNull();
  });

  it('rejects other nip19 types it does not support', () => {
    // nsec encodings are decodable but should not be returned as a pubkey.
    const nsec = 'nsec180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsf3u6px';
    expect(npubToHex(nsec)).toBeNull();
  });
});
