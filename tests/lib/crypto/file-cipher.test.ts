import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { decryptFile, encryptFile, FileIntegrityError } from '@/lib/crypto/file-cipher';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('file-cipher', () => {
  it('round-trips and reports hashes of both sides', async () => {
    const plain = bytes('a secret picture');
    const enc = await encryptFile(plain);
    expect(enc.key).toMatch(/^[0-9a-f]{64}$/);
    expect(enc.nonce).toMatch(/^[0-9a-f]{24}$/);
    expect(enc.size).toBe(plain.length);
    expect(enc.x).toBe(bytesToHex(sha256(enc.ciphertext)));
    expect(enc.ox).toBe(bytesToHex(sha256(plain)));
    // GCM appends a 16-byte tag; the plaintext must not appear in the blob.
    expect(enc.ciphertext.length).toBe(plain.length + 16);
    expect(new TextDecoder().decode(enc.ciphertext)).not.toContain('secret');

    const out = await decryptFile(enc.ciphertext, enc.key, enc.nonce, enc.x);
    expect(new TextDecoder().decode(out)).toBe('a secret picture');
  });

  it('uses a fresh key and nonce per file', async () => {
    const a = await encryptFile(bytes('same'));
    const b = await encryptFile(bytes('same'));
    expect(a.key).not.toBe(b.key);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.x).not.toBe(b.x);
  });

  it('rejects a blob whose hash does not match x', async () => {
    const enc = await encryptFile(bytes('payload'));
    const tampered = enc.ciphertext.slice();
    tampered[0] ^= 1;
    await expect(decryptFile(tampered, enc.key, enc.nonce, enc.x)).rejects.toBeInstanceOf(FileIntegrityError);
  });

  it('rejects tampering even without x (GCM tag)', async () => {
    const enc = await encryptFile(bytes('payload'));
    const tampered = enc.ciphertext.slice();
    tampered[tampered.length - 1] ^= 1;
    await expect(decryptFile(tampered, enc.key, enc.nonce)).rejects.toBeInstanceOf(FileIntegrityError);
  });

  it('fails with the wrong key', async () => {
    const enc = await encryptFile(bytes('payload'));
    const other = await encryptFile(bytes('x'));
    await expect(decryptFile(enc.ciphertext, other.key, enc.nonce, enc.x)).rejects.toBeInstanceOf(FileIntegrityError);
  });
});
