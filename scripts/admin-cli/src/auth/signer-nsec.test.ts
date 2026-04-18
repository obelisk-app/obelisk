import { describe, it, expect } from 'vitest';
import { verifyEvent } from 'nostr-tools/pure';
import { generateSecretKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { bytesToHex } from 'nostr-tools/utils';
import { decodeNsec, signChallengeWithNsec, pubkeyFromNsec } from './signer-nsec';

describe('signer-nsec', () => {
  const secret = generateSecretKey();
  const nsec = nip19.nsecEncode(secret);

  it('decodes nsec1 and hex forms to the same secret', () => {
    expect(bytesToHex(decodeNsec(nsec))).toBe(bytesToHex(secret));
    expect(bytesToHex(decodeNsec(bytesToHex(secret)))).toBe(bytesToHex(secret));
  });

  it('rejects invalid input', () => {
    expect(() => decodeNsec('not-a-key')).toThrow();
  });

  it('produces a kind-27235 event with challenge as content and matching pubkey', () => {
    const challenge = 'obelisk-auth:deadbeef:1234567890';
    const signed = signChallengeWithNsec(secret, challenge);
    expect(signed.kind).toBe(27235);
    expect(signed.content).toBe(challenge);
    expect(signed.pubkey).toBe(pubkeyFromNsec(secret));
    expect(signed.tags).toEqual([]);
  });

  it('produces a signature that passes verifyEvent (matching server check)', () => {
    const signed = signChallengeWithNsec(secret, 'obelisk-auth:abc:123');
    expect(verifyEvent(signed as any)).toBe(true);
  });
});
