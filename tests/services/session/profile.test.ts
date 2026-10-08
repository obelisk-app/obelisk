import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeImpl } from '@/services/nostr-bridge';
import { updateSessionProfile } from '@/services/session/profile';
import { profileFormValues } from '@/utils/chat/profile/profile-form-values';

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
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://cdn.example/picture' }) });
    vi.stubGlobal('fetch', fetch);
    const pictureFile = { type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File;
    await updateSessionProfile(bridge, { ...profileFormValues(null), name: ' Alice ', about: ' About ', banner: ' https://cdn.example/banner ', pictureFile }, uploading);
    expect(sign).toHaveBeenCalledOnce();
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice', displayName: 'Alice', about: 'About', picture: 'https://cdn.example/picture', banner: 'https://cdn.example/banner' }), { assertCurrent: expect.any(Function) });
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
    response.resolve({ ok: true, json: async () => ({ url: 'https://cdn.example/avatar' }) } as Response);
    expect(await result).toBe('AbortError');
    expect(edit).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(uploading).toHaveBeenLastCalledWith(null);
  });
});
