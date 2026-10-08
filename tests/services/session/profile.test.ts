import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeImpl } from '@/services/nostr-bridge';
import { updateSessionProfile } from '@/services/session/profile';
import { profileFormValues } from '@/utils/chat/profile/profile-form-values';

function descriptor(bytes: Uint8Array) {
  const hash = bytesToHex(sha256(bytes));
  return { url: `https://cdn.example/${hash}.png`, sha256: hash, size: bytes.byteLength, type: 'image/png', uploaded: 1_700_000_000 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const account = { pubkey: 'a'.repeat(64), generation: 1, loggedIn: true };
  const sign = vi.fn(async (template) => ({ ...template, pubkey: account.pubkey, id: 'b'.repeat(64), sig: 'b'.repeat(128) }));
  const edit = vi.fn(async () => undefined);
  const bridge = {
    getPublicKey: () => account.pubkey,
    getSessionGeneration: () => account.generation,
    isLoggedIn: { get: () => account.loggedIn },
    myLoginMethod: { get: () => 'nip07' },
    bunkerSignerReady: { get: () => false },
    signEventTemplate: sign,
    editUserMetadata: edit,
  } as unknown as BridgeImpl;
  return { bridge, account, sign, edit };
}

afterEach(() => vi.unstubAllGlobals());

describe('session profile action', () => {
  it('trims profile fields and uploads images before editing metadata', async () => {
    const { bridge, edit, sign } = setup();
    const uploading = vi.fn();
    const uploaded = descriptor(new Uint8Array([1]));
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => uploaded });
    vi.stubGlobal('fetch', fetch);
    const pictureFile = { type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File;
    await updateSessionProfile(bridge, { ...profileFormValues(null), name: ' Alice ', about: ' About ', banner: ' https://cdn.example/banner ', pictureFile }, uploading);
    expect(sign).toHaveBeenCalledOnce();
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice', displayName: 'Alice', about: 'About', picture: uploaded.url, banner: 'https://cdn.example/banner' }), { assertCurrent: expect.any(Function) });
    expect(uploading).toHaveBeenCalledWith('picture');
    expect(uploading).toHaveBeenLastCalledWith(null);
  });

  it('does not sign or upload a file after the same account logs in again during file reading', async () => {
    const { bridge, account, edit, sign } = setup();
    const read = deferred<ArrayBuffer>();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const pictureFile = { type: 'image/png', arrayBuffer: () => read.promise } as File;
    const pending = updateSessionProfile(bridge, { ...profileFormValues(null), name: 'Alice', pictureFile });
    const result = pending.catch((error: Error) => error.name);
    account.generation++;
    read.resolve(new ArrayBuffer(1));
    expect(await result).toBe('AbortError');
    expect(sign).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it('does not publish metadata after logout while an upload is in flight', async () => {
    const { bridge, account, edit } = setup();
    const response = deferred<Response>();
    const fetch = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetch);
    const pictureFile = { type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File;
    const uploading = vi.fn();
    const pending = updateSessionProfile(bridge, { ...profileFormValues(null), name: 'Alice', pictureFile }, uploading);
    const result = pending.catch((error: Error) => error.name);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    account.generation++;
    account.loggedIn = false;
    response.resolve({ ok: true, json: async () => descriptor(new Uint8Array([1])) } as Response);
    expect(await result).toBe('AbortError');
    expect(edit).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(uploading).toHaveBeenLastCalledWith(null);
  });

  it('stops after an old account finishes signing, before uploading either image', async () => {
    const { bridge, account, edit, sign } = setup();
    const signed = deferred<Awaited<ReturnType<typeof sign>>>();
    sign.mockImplementationOnce(() => signed.promise);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const file = { type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File;
    const uploading = vi.fn();
    const pending = updateSessionProfile(bridge, { ...profileFormValues(null), name: 'Alice', pictureFile: file, bannerFile: file }, uploading);
    const result = pending.catch((error: Error) => error.name);
    await vi.waitFor(() => expect(sign).toHaveBeenCalledOnce());
    const template = sign.mock.calls[0][0];
    const oldPubkey = account.pubkey;
    account.pubkey = 'c'.repeat(64);
    account.generation++;
    signed.resolve({ ...template, pubkey: oldPubkey, id: 'b'.repeat(64), sig: 'b'.repeat(128) });
    expect(await result).toBe('AbortError');
    expect(sign).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
    expect(uploading).not.toHaveBeenCalledWith('banner');
    expect(uploading).toHaveBeenLastCalledWith(null);
  });

  it('does not fall back or start the banner when the account changes during a failed picture upload', async () => {
    const { bridge, account, edit, sign } = setup();
    const response = deferred<Response>();
    const fetch = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetch);
    const file = { type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File;
    const uploading = vi.fn();
    const pending = updateSessionProfile(bridge, { ...profileFormValues(null), name: 'Alice', pictureFile: file, bannerFile: file }, uploading);
    const result = pending.catch((error: Error) => error.name);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    account.pubkey = 'c'.repeat(64);
    account.generation++;
    response.resolve({ ok: false, status: 503, text: async () => 'Unavailable' } as Response);
    expect(await result).toBe('AbortError');
    expect(sign).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(edit).not.toHaveBeenCalled();
    expect(uploading).not.toHaveBeenCalledWith('banner');
    expect(uploading).toHaveBeenLastCalledWith(null);
  });

  it('rejects a descriptor resolved after a same-account session replacement', async () => {
    const { bridge, account, edit } = setup();
    const parsed = deferred<ReturnType<typeof descriptor>>();
    const json = vi.fn(() => parsed.promise);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal('fetch', fetch);
    const file = { type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File;
    const pending = updateSessionProfile(bridge, { ...profileFormValues(null), name: 'Alice', pictureFile: file });
    const result = pending.catch((error: Error) => error.name);
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    account.generation++;
    parsed.resolve(descriptor(new Uint8Array([1])));
    expect(await result).toBe('AbortError');
    expect(fetch).toHaveBeenCalledOnce();
    expect(edit).not.toHaveBeenCalled();
  });

});
