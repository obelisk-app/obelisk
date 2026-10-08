import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptFile, FileIntegrityError } from '@nostr-wot/dm';
import type { JsDmFile } from '@/utils/attachments/dm-file';
import { fetchDecrypted } from '@/services/chat/dm/dm-file-decrypt';

async function makeFile(): Promise<{ meta: JsDmFile; cipher: Uint8Array }> {
  const enc = await encryptFile(new TextEncoder().encode('pixels'));
  return {
    cipher: enc.ciphertext,
    meta: { url: 'https://blossom.example/b', mimeType: 'image/png', algorithm: 'aes-gcm', key: enc.key, nonce: enc.nonce, x: enc.x, size: 6 },
  };
}

describe('fetchDecrypted', () => {
  const blobs: Blob[] = [];
  beforeEach(() => {
    blobs.length = 0;
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn((b: Blob) => { blobs.push(b); return `blob:test/${blobs.length}`; }),
      revokeObjectURL: vi.fn(),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches without a referrer, decrypts, and hands back an object URL typed as the file', async () => {
    const { meta, cipher } = await makeFile();
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => cipher.slice().buffer }));
    vi.stubGlobal('fetch', fetchMock);

    const url = await fetchDecrypted(meta, new AbortController().signal);

    expect(url).toBe('blob:test/1');
    expect(fetchMock).toHaveBeenCalledWith(meta.url, expect.objectContaining({ referrerPolicy: 'no-referrer' }));
    expect(blobs[0].type).toBe('image/png');
    expect(await blobs[0].text()).toBe('pixels');
  });

  it('rejects on a non-2xx response before touching the cipher', async () => {
    const { meta } = await makeFile();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) })));

    await expect(fetchDecrypted(meta, new AbortController().signal)).rejects.toThrow('HTTP 404');
    expect(blobs).toHaveLength(0);
  });

  it('surfaces a swapped blob as a FileIntegrityError', async () => {
    const { meta, cipher } = await makeFile();
    const bad = cipher.slice();
    bad[0] ^= 1;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => bad.buffer })));

    await expect(fetchDecrypted(meta, new AbortController().signal)).rejects.toBeInstanceOf(FileIntegrityError);
    expect(blobs).toHaveLength(0);
  });

  it('never creates an object URL when the caller aborted mid-flight', async () => {
    const { meta, cipher } = await makeFile();
    const ctrl = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => {
      ctrl.abort();
      return { ok: true, arrayBuffer: async () => cipher.slice().buffer };
    }));

    await expect(fetchDecrypted(meta, ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(blobs).toHaveLength(0);
  });
});
