import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { BlossomUploadError, uploadEncryptedBlob, uploadToBlossom } from '@/services/media/blossom';
import { ENCRYPTED_BLOSSOM_SERVERS } from '@/constants/media/blossom';

const { signEventTemplate } = vi.hoisted(() => ({ signEventTemplate: vi.fn() }));
vi.mock('@/services/nostr-bridge', () => ({ nostrActions: { signEventTemplate } }));

function descriptor(bytes: Uint8Array, type = 'application/octet-stream') {
  const hash = bytesToHex(sha256(bytes));
  return { url: `https://cdn.example/${hash}`, sha256: hash, size: bytes.byteLength, type, uploaded: 1_700_000_000 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('uploadToBlossom', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signs pre-login uploads with the generated secret key', async () => {
    const secretKey = new Uint8Array(32).fill(1);
    const uploaded = descriptor(new Uint8Array([1, 2, 3]), 'image/png');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => uploaded });
    vi.stubGlobal('fetch', fetchMock);
    const file = {
      type: 'image/png',
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as File;

    await expect(uploadToBlossom(file, secretKey)).resolves.toBe(uploaded.url);
    const authorization = fetchMock.mock.calls[0][1].headers.Authorization as string;
    const event = JSON.parse(atob(authorization.slice('Nostr '.length)));
    expect(event.kind).toBe(24242);
    expect(event.pubkey).toBe(getPublicKey(secretKey));
    expect(signEventTemplate).not.toHaveBeenCalled();
  });

  it('cancels after signing rather than sending an upload for a replaced account', async () => {
    const signed = deferred<void>();
    const secretKey = new Uint8Array(32).fill(3);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let active = true;
    const signer = vi.fn(async (template: Parameters<typeof finalizeEvent>[0]) => {
      await signed.promise;
      return finalizeEvent(template, secretKey);
    });
    const pending = uploadToBlossom({ type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File, undefined, {
      signEventTemplate: signer,
      assertCurrent: () => { if (!active) throw new DOMException('Account replaced', 'AbortError'); },
    });
    const result = pending.catch((error: Error) => error);
    await vi.waitFor(() => expect(signer).toHaveBeenCalledOnce());
    active = false;
    signed.resolve();
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signer).toHaveBeenCalledOnce();
  });

  it.each([true, false])('cancels after a fetch resolves (ok=%s), without returning its URL or trying another server', async (ok) => {
    const response = deferred<Response>();
    const fetchMock = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetchMock);
    let active = true;
    const pending = uploadToBlossom({ type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File, new Uint8Array(32).fill(4), {
      assertCurrent: () => { if (!active) throw new DOMException('Account replaced', 'AbortError'); },
    });
    const result = pending.catch((error: Error) => error);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    active = false;
    response.resolve({ ok, status: ok ? 200 : 503, text: async () => 'Unavailable', json: async () => descriptor(new Uint8Array([1]), 'image/png') } as Response);
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('when every server refuses, says so as one BlossomUploadError with a reason per server', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413, text: async () => 'too big' }));
    const file = { type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File;
    const err = await uploadToBlossom(file, new Uint8Array(32).fill(2)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BlossomUploadError);
    expect((err as BlossomUploadError).reasons).toHaveLength(3);
    expect((err as BlossomUploadError).reasons[0]).toContain('413 too big');
    warn.mockRestore();
  });
});

describe('uploadEncryptedBlob', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signs with a throwaway key, never the session, and hides the mime type', async () => {
    signEventTemplate.mockClear();
    const blob = new Uint8Array([9, 9, 9]);
    const hash = bytesToHex(sha256(blob));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unknown key' })
      .mockResolvedValueOnce({ ok: true, json: async () => descriptor(blob) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadEncryptedBlob(blob)).resolves.toBe(`https://cdn.example/${hash}`);
    expect(signEventTemplate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const events = fetchMock.mock.calls.map((c) => {
      const auth = c[1].headers.Authorization as string;
      return JSON.parse(atob(auth.slice('Nostr '.length)));
    });
    // Same throwaway key across the fallback, but each token is bound to its server.
    expect(events[0].pubkey).toBe(events[1].pubkey);
    const servers = events.map((e) => e.tags.find((t: string[]) => t[0] === 'server')?.[1]);
    expect(servers[0]).not.toBe(servers[1]);
    expect(servers[0]).toBe(new URL(fetchMock.mock.calls[0][0]).host);
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers['Content-Type']).toBe('application/octet-stream');
    }
  });

  it('uses a different throwaway key per upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => descriptor(new Uint8Array([1])) });
    vi.stubGlobal('fetch', fetchMock);
    await uploadEncryptedBlob(new Uint8Array([1]));
    await uploadEncryptedBlob(new Uint8Array([1]));
    const pubkeys = fetchMock.mock.calls.map((c) =>
      JSON.parse(atob((c[1].headers.Authorization as string).slice(6))).pubkey);
    expect(pubkeys[0]).not.toBe(pubkeys[1]);
  });

  it('goes to the servers that accept opaque blobs, not the media-sniffing ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadEncryptedBlob(new Uint8Array([1]))).rejects.toThrow();
    const hosts = fetchMock.mock.calls.map((c) => new URL(c[0]).origin);
    expect(hosts).toEqual(ENCRYPTED_BLOSSOM_SERVERS);
    expect(hosts).not.toContain('https://blossom.primal.net');
  });

  it("treats an HTML 200 or a URL that doesn't name the blob as a failure, and says why", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...descriptor(new Uint8Array([2])), url: 'https://cdn.example/something-else' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadEncryptedBlob(new Uint8Array([2]))).rejects.toThrow(/not a Blossom JSON response.*does not name the uploaded blob/);
  });
});
