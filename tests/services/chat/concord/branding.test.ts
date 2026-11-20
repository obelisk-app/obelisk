import { afterEach, expect, it, vi } from 'vitest';
import { sealConcordAttachment } from '@/lib/crypto/concord-attachment';
import { createConcordBrandingLoader } from '@/services/chat/concord/branding';

afterEach(() => vi.unstubAllGlobals());

it('verifies and recovers encrypted artwork after a reload even when Blossom is unavailable', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const sealed = await sealConcordAttachment(bytes);
  const pointer = {
    url: 'https://media.example/blob',
    hash: sealed.originalSha256,
    key: sealed.encryption.key,
    nonce: sealed.encryption.nonce,
  };
  const db = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => db.get(key) ?? null,
    setItem: async (key: string, value: string) => { db.set(key, value); },
    removeItem: async (key: string) => { db.delete(key); },
  };
  const fetch = vi.fn().mockResolvedValueOnce(new Response(sealed.ciphertext));
  fetch.mockRejectedValue(new Error('Offline'));
  vi.stubGlobal('fetch', fetch);

  const first = createConcordBrandingLoader(storage);
  expect((await first(pointer)).type).toBe('image/png');
  const restored = createConcordBrandingLoader(storage);
  expect((await restored(pointer)).type).toBe('image/png');
  expect(fetch).toHaveBeenCalledOnce();
  expect([...db.values()].join('')).not.toContain(pointer.key);
});
