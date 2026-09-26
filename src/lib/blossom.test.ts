import { getPublicKey } from 'nostr-tools/pure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ENCRYPTED_BLOSSOM_SERVERS, uploadEncryptedBlob, uploadToBlossom } from './blossom';

const { signEventTemplate } = vi.hoisted(() => ({ signEventTemplate: vi.fn() }));
vi.mock('@/lib/nostr-bridge', () => ({ nostrActions: { signEventTemplate } }));

describe('uploadToBlossom', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signs pre-login uploads with the generated secret key', async () => {
    const secretKey = new Uint8Array(32).fill(1);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://cdn.example/avatar.jpg' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const file = {
      type: 'image/png',
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as File;

    await expect(uploadToBlossom(file, secretKey)).resolves.toBe('https://cdn.example/avatar.jpg');
    const authorization = fetchMock.mock.calls[0][1].headers.Authorization as string;
    const event = JSON.parse(atob(authorization.slice('Nostr '.length)));
    expect(event.kind).toBe(24242);
    expect(event.pubkey).toBe(getPublicKey(secretKey));
    expect(signEventTemplate).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: `https://cdn.example/${hash}` }) });
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
    const hash = bytesToHex(sha256(new Uint8Array([1])));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: `https://cdn.example/${hash}` }) });
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
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://cdn.example/something-else' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadEncryptedBlob(new Uint8Array([2]))).rejects.toThrow(/not a Blossom JSON response.*does not name the uploaded blob/);
  });
});
