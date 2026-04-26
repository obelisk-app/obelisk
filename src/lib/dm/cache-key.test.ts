import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateCacheKey, _resetCacheKeyState, encryptToCache, decryptFromCache, type KEKSigner } from './cache-key';

interface MockSigner {
  pubkey: string;
  nip44Encrypt: ReturnType<typeof vi.fn>;
  nip44Decrypt: ReturnType<typeof vi.fn>;
}

function mockSigner(pubkey = 'a'.repeat(64)): MockSigner {
  return {
    pubkey,
    nip44Encrypt: vi.fn(async (_pk: string, plaintext: string) => `WRAP|${plaintext}`),
    nip44Decrypt: vi.fn(async (_pk: string, ciphertext: string) => ciphertext.replace(/^WRAP\|/, '')),
  };
}

// Cast helper — vi.fn's structural type doesn't satisfy KEKSigner's strict
// signatures, but at runtime they're identical.
const asKEKSigner = (m: MockSigner): KEKSigner => m as unknown as KEKSigner;

describe('cache-key', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetCacheKeyState();
  });

  it('first call generates + wraps the key, persists wrapped form', async () => {
    const signer = mockSigner();
    const key = await getOrCreateCacheKey(signer.pubkey, asKEKSigner(signer));
    expect(key).toBeDefined();
    expect(signer.nip44Encrypt).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`obelisk:dm-cache-key:${signer.pubkey}`)).toMatch(/^WRAP\|/);
  });

  it('second call within session returns RAM-cached key with zero signer calls', async () => {
    const signer = mockSigner();
    await getOrCreateCacheKey(signer.pubkey, asKEKSigner(signer));
    signer.nip44Encrypt.mockClear();
    signer.nip44Decrypt.mockClear();
    await getOrCreateCacheKey(signer.pubkey, asKEKSigner(signer));
    expect(signer.nip44Encrypt).not.toHaveBeenCalled();
    expect(signer.nip44Decrypt).not.toHaveBeenCalled();
  });

  it('after RAM reset, unwraps via signer exactly once', async () => {
    const signer = mockSigner();
    await getOrCreateCacheKey(signer.pubkey, asKEKSigner(signer));
    _resetCacheKeyState();
    signer.nip44Encrypt.mockClear();
    signer.nip44Decrypt.mockClear();
    await getOrCreateCacheKey(signer.pubkey, asKEKSigner(signer));
    expect(signer.nip44Decrypt).toHaveBeenCalledTimes(1);
    expect(signer.nip44Encrypt).not.toHaveBeenCalled();
  });

  it('imports the AES key as non-extractable', async () => {
    const signer = mockSigner();
    const key = await getOrCreateCacheKey(signer.pubkey, asKEKSigner(signer));
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeDefined();
  });

  it('encryptToCache + decryptFromCache round-trip a string', async () => {
    const signer = mockSigner();
    const key = await getOrCreateCacheKey(signer.pubkey, asKEKSigner(signer));
    const blob = await encryptToCache(key, 'top secret');
    expect(blob).not.toContain('top secret');
    const back = await decryptFromCache(key, blob);
    expect(back).toBe('top secret');
  });
});
