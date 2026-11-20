import type { BlobPointer } from '@applesauce/concord';
import type { ConcordStorage } from '@applesauce/concord/client';
import { openConcordAttachment } from '@/lib/crypto/concord-attachment';
import { fromBase64Url, toBase64Url } from '@/lib/crypto/webcrypto';
import { fetchConcordCiphertext } from './media';

const BRANDING_CACHE_KEY = 'obelisk/branding-ciphertext';
const CACHE_BYTES = 8 * 1024 * 1024;
const CACHE_ENTRIES = 32;

type CachedImage = { id: string; ciphertext: string };

async function decodeImage(pointer: BlobPointer, ciphertext: Uint8Array) {
  const bytes = await openConcordAttachment(ciphertext, {
    originalSha256: pointer.hash,
    encryption: { algorithm: 'aes-gcm', key: pointer.key, nonce: pointer.nonce },
  });
  const prefix = new TextDecoder().decode(bytes.slice(0, 12));
  const type = bytes[0] === 137 && prefix.slice(1, 4) === 'PNG' ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg'
    : prefix.startsWith('GIF8') ? 'image/gif'
    : prefix.startsWith('RIFF') && prefix.slice(8) === 'WEBP' ? 'image/webp' : null;
  if (!type) throw new Error('Unsupported community image');
  return new Blob([bytes], { type });
}

/** One bounded, account-scoped cache. IndexedDB receives sealed ciphertext only. */
export function createConcordBrandingLoader(storage: ConcordStorage, assertCurrent = () => {}) {
  const inFlight = new Map<string, Promise<Blob>>();
  let writes = Promise.resolve();
  const read = async (): Promise<CachedImage[]> => {
    try {
      const raw = await storage.getItem(BRANDING_CACHE_KEY);
      if (!raw || raw.length > CACHE_BYTES + CACHE_ENTRIES * 512) return [];
      const records: unknown = JSON.parse(raw);
      if (!Array.isArray(records)) return [];
      return records.filter((record): record is CachedImage => (
        !!record && typeof record.id === 'string' && typeof record.ciphertext === 'string'
      )).slice(0, CACHE_ENTRIES);
    } catch { return []; }
  };

  return (pointer: BlobPointer): Promise<Blob> => {
    const id = JSON.stringify([pointer.url, pointer.hash]);
    const requestId = JSON.stringify([id, pointer.key, pointer.nonce]);
    const pending = inFlight.get(requestId);
    if (pending) return pending;
    const load = async () => {
      assertCurrent();
      const cached = (await read()).find((row) => row.id === id);
      assertCurrent();
      if (cached) {
        try { return await decodeImage(pointer, fromBase64Url(cached.ciphertext)); }
        catch { /* Retry the original source if the cached bytes cannot be authenticated. */ }
      }

      const ciphertext = await fetchConcordCiphertext(pointer.url);
      assertCurrent();
      const image = await decodeImage(pointer, ciphertext);
      assertCurrent();
      if (ciphertext.length * 4 / 3 < CACHE_BYTES) {
        const saved = { id, ciphertext: toBase64Url(ciphertext) };
        writes = writes.then(async () => {
          const records = (await read()).filter((row) => row.id !== id);
          let size = saved.ciphertext.length;
          const next = [saved];
          for (const row of records) {
            size += row.ciphertext.length;
            if (size > CACHE_BYTES || next.length >= CACHE_ENTRIES) break;
            next.push(row);
          }
          await storage.setItem(BRANDING_CACHE_KEY, JSON.stringify(next));
        }).catch(() => {});
        await writes;
      }
      return image;
    };
    const image = load().finally(() => inFlight.delete(requestId));
    inFlight.set(requestId, image);
    return image;
  };
}
