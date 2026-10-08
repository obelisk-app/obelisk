import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptFile } from '@nostr-wot/dm';
import type { JsDmFile } from '@/utils/attachments/dm-file';
import { useDecryptedDmFile } from '@/hooks/chat/dm/message/useDecryptedDmFile';

async function makeFile(): Promise<{ meta: JsDmFile; cipher: Uint8Array }> {
  const enc = await encryptFile(new TextEncoder().encode('pixels'));
  return {
    cipher: enc.ciphertext,
    meta: { url: 'https://blossom.example/b', mimeType: 'image/png', algorithm: 'aes-gcm', key: enc.key, nonce: enc.nonce, x: enc.x, size: 6 },
  };
}

describe('useDecryptedDmFile', () => {
  const created: string[] = [];
  const revoked: string[] = [];
  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => { const u = `blob:test/${created.length + 1}`; created.push(u); return u; }),
      revokeObjectURL: vi.fn((u: string) => { revoked.push(u); }),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts loading on mount when auto, resolves to the object URL and revokes it on unmount', async () => {
    const { meta, cipher } = await makeFile();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => cipher.slice().buffer })));

    const { result, unmount } = renderHook(() => useDecryptedDmFile(meta, true));
    expect(result.current.state).toEqual({ status: 'loading' });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', url: created[0] }));
    unmount();
    expect(revoked).toEqual([created[0]]);
  });

  it('stays idle and fetches nothing until load() is called', async () => {
    const { meta, cipher } = await makeFile();
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => cipher.slice().buffer }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDecryptedDmFile(meta, false));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => result.current.load());
    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flags a swapped blob as an integrity error and a dead server as a plain one', async () => {
    const { meta, cipher } = await makeFile();
    const bad = cipher.slice();
    bad[0] ^= 1;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => bad.buffer })));
    const swapped = renderHook(() => useDecryptedDmFile(meta, true));
    await waitFor(() => expect(swapped.result.current.state).toEqual({ status: 'error', integrity: true }));

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) })));
    const down = renderHook(() => useDecryptedDmFile(meta, true));
    await waitFor(() => expect(down.result.current.state).toEqual({ status: 'error', integrity: false }));
    expect(created).toHaveLength(0);
  });

  it('drops a result that lands after unmount instead of leaking the blob', async () => {
    const { meta, cipher } = await makeFile();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal('fetch', vi.fn(async () => { await gate; return { ok: true, arrayBuffer: async () => cipher.slice().buffer }; }));

    const { result, unmount } = renderHook(() => useDecryptedDmFile(meta, true));
    unmount();
    release();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(result.current.state).toEqual({ status: 'loading' });
    // Either the abort short-circuited before the URL existed, or it was revoked at once.
    expect(created.every((u) => revoked.includes(u))).toBe(true);
  });
});
