import { describe, expect, it } from 'vitest';
import { openConcordAttachment, sealConcordAttachment } from '@/lib/crypto/concord-attachment';

describe('Concord attachment encryption', () => {
  it('round trips with fresh per-file keys and the interoperable 16-byte nonce', async () => {
    const plaintext = new TextEncoder().encode('private attachment');
    const first = await sealConcordAttachment(plaintext);
    const second = await sealConcordAttachment(plaintext);
    expect(first.encryption.nonce).toHaveLength(32);
    expect(first.encryption.key).toHaveLength(64);
    expect(first.encryption.key).not.toBe(second.encryption.key);
    expect(first.ciphertext.length).toBe(plaintext.length + 16);
    expect(Array.from(await openConcordAttachment(first.ciphertext, first))).toEqual(Array.from(plaintext));
  });

  it('rejects tampering, wrong keys, plaintext hashes and unsupported encryption', async () => {
    const box = await sealConcordAttachment(new TextEncoder().encode('private'));
    const corrupted = box.ciphertext.slice();
    corrupted[0] ^= 1;
    await expect(openConcordAttachment(corrupted, box)).rejects.toThrow('digest');
    await expect(openConcordAttachment(corrupted, { encryption: box.encryption })).rejects.toThrow();
    await expect(openConcordAttachment(box.ciphertext, { ...box, originalSha256: '0'.repeat(64) })).rejects.toThrow('plaintext digest');
    await expect(openConcordAttachment(box.ciphertext, { ...box, encryption: { ...box.encryption, key: '0'.repeat(64) } })).rejects.toThrow();
    await expect(openConcordAttachment(box.ciphertext, { ...box, encryption: { ...box.encryption, algorithm: 'none' } })).rejects.toThrow('Invalid attachment encryption');
  });
});
