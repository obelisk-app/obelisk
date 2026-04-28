import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'crypto';
import { encrypt, decrypt } from './crypto';

beforeAll(() => {
  process.env.NWC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('crypto', () => {
  it('round-trips a string', () => {
    const secret = 'nostr+walletconnect://abc?relay=wss://relay.example&secret=deadbeef';
    const ct = encrypt(secret);
    expect(ct).not.toContain('walletconnect');
    expect(decrypt(ct)).toBe(secret);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const s = 'hello';
    expect(encrypt(s)).not.toBe(encrypt(s));
  });

  it('rejects tampered ciphertext', () => {
    const ct = encrypt('secret');
    const buf = Buffer.from(ct, 'base64');
    buf[20] ^= 0xff;
    expect(() => decrypt(buf.toString('base64'))).toThrow();
  });
});
