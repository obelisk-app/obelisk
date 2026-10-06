/**
 * `DmStoreModule` on its own, with a fake signer and a fake IndexedDB: what
 * a refused unlock leaves behind, the retry, the read-state wait, and a
 * wrapped key that no longer opens into a key.
 */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { NipSigner } from '@/lib/nip-59';
import { DmStoreModule, type HeldKind } from '@/services/nostr-bridge/dm/store';
import { dmStoreDb } from '@/services/nostr-bridge/dm/store-db';

const ME = 'a'.repeat(64);

function wrap(id: string, createdAt = 1_000): NostrEvent {
  return { id, pubkey: 'e'.repeat(64), created_at: createdAt, kind: 1059, tags: [['p', ME]], content: 'ct', sig: 's' };
}

/** A signer whose NIP-44 to self is a reversible stand-in, with switches to refuse or garble. */
function fakeSigner(opts: { refuse?: boolean; garble?: boolean } = {}) {
  const signer = {
    pubkey: ME,
    signEvent: vi.fn(),
    nip44Encrypt: vi.fn(async (_pk: string, text: string) => {
      if (opts.refuse) throw new Error('user said no');
      return `enc:${btoa(text)}`;
    }),
    nip44Decrypt: vi.fn(async (_pk: string, ct: string) => {
      if (opts.refuse) throw new Error('user said no');
      return opts.garble ? 'not a key' : atob(ct.slice(4));
    }),
  };
  return signer as typeof signer & NipSigner;
}

let idb: IDBFactory;
beforeEach(() => {
  idb = new IDBFactory();
  vi.stubGlobal('indexedDB', idb);
});
afterEach(() => vi.unstubAllGlobals());

function build(signer: NipSigner, dmsEnabled = true) {
  const reingest = vi.fn<(ev: NostrEvent, kind: HeldKind) => void>();
  const replay = vi.fn();
  const store = new DmStoreModule({ nipSigner: () => signer, replay, reingest, dmsEnabled: () => dmsEnabled });
  store.attach(ME);
  return { store, reingest, replay };
}

describe('DmStoreModule', () => {
  it('a refused unlock stays locked and keeps what it held; a retry opens and hands it all back', async () => {
    const refusing = fakeSigner({ refuse: true });
    const reingest = vi.fn();
    let signer: NipSigner = refusing;
    const store = new DmStoreModule({ nipSigner: () => signer, replay: vi.fn(), reingest, dmsEnabled: () => true });
    store.attach(ME);
    expect(store.hold(wrap('w1', 2), 'wrap')).toBe(true);
    await store.unlock();
    expect(store.lock.get()).toEqual({ status: 'failed', unopened: [2_000] });
    expect(reingest).not.toHaveBeenCalled();

    signer = fakeSigner();
    await store.unlock();
    expect(store.lock.get()).toEqual({ status: 'unlocked', unopened: [] });
    expect(reingest).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), 'wrap');
    expect(store.hold(wrap('w2'), 'wrap')).toBe(false);
  });

  it('the read-state sync waits only while DMs are on and locked', async () => {
    const { store } = build(fakeSigner());
    const later = vi.fn();
    expect(store.defer(later)).toBe(true);
    await store.unlock();
    expect(later).toHaveBeenCalledTimes(1);
    expect(store.defer(vi.fn())).toBe(false);

    const off = build(fakeSigner(), false).store;
    expect(off.defer(vi.fn())).toBe(false);
  });

  it('opens once: a second unlock while the first is asking costs no second prompt', async () => {
    const signer = fakeSigner();
    const { store } = build(signer);
    await Promise.all([store.unlock(), store.unlock()]);
    expect(signer.nip44Encrypt).toHaveBeenCalledTimes(1);
    expect(signer.nip44Decrypt).not.toHaveBeenCalled();
  });

  it('a wrapped key that opens into something else starts over: old records go, a new key is made', async () => {
    const db = dmStoreDb(idb);
    await build(fakeSigner()).store.unlock();
    await db.put(ME, 'old', { v: 1, iv: 'x', ct: 'y' });

    const garbling = fakeSigner({ garble: true });
    const { store } = build(garbling);
    await store.unlock();
    expect(store.lock.get().status).toBe('unlocked');
    expect(garbling.nip44Encrypt).toHaveBeenCalledTimes(1);
    expect(await db.wireIds(ME)).toEqual([]);
  });

  it('logout forgets the key in memory and deletes the account on disk', async () => {
    const db = dmStoreDb(idb);
    const { store } = build(fakeSigner());
    await store.unlock();
    await db.put(ME, 'w', { v: 1, iv: 'x', ct: 'y' });
    await store.destroy();
    expect(store.lock.get().status).toBe('locked');
    expect(await db.wireIds(ME)).toEqual([]);
    expect(await db.wrappedKey(ME)).toBeUndefined();
  });
});
