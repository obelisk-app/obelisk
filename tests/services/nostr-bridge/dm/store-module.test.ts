/**
 * `DmStoreModule` on its own, with a fake signer and a fake IndexedDB: what
 * a refused unlock leaves behind, the retry, the read-state wait, a wrapped
 * key that no longer opens into a key, and the locked count waiting for the
 * store's index.
 */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { NipSigner } from '@/types/nostr/nip-signer';
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
  it('opening a known conversation leaves other senders and unknown gift wraps encrypted', async () => {
    const { store, reingest } = build(fakeSigner());
    const alice = 'a'.repeat(64);
    const bob = 'b'.repeat(64);
    store.hold({ ...wrap('alice'), pubkey: alice }, 'nip04');
    store.hold({ ...wrap('bob'), pubkey: bob }, 'nip04');
    store.hold(wrap('unknown'), 'wrap');
    await store.unlock(alice);
    await vi.waitFor(() => expect(reingest).toHaveBeenCalledTimes(1));
    expect(reingest).toHaveBeenCalledWith(expect.objectContaining({ id: 'alice' }), 'nip04');
    await store.unlock();
    await vi.waitFor(() => expect(reingest).toHaveBeenCalledTimes(3));
  });

  it('keeps reporting queued message loading after the storage key is unlocked', async () => {
    let finish!: () => void;
    const reingest = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const store = new DmStoreModule({ nipSigner: () => fakeSigner(), replay: vi.fn(), reingest, dmsEnabled: () => true });
    store.attach(ME);
    store.hold(wrap('slow'), 'wrap');
    await store.unlock();
    expect(store.isUnlocked()).toBe(true);
    expect(store.lock.get().pendingDecryptions).toBe(1);
    finish();
    await vi.waitFor(() => expect(store.lock.get().pendingDecryptions ?? 0).toBe(0));
  });

  it('does not let old pending decryption overwrite another account lock', async () => {
    let finish!: () => void;
    const store = new DmStoreModule({ nipSigner: () => fakeSigner(), replay: vi.fn(), reingest: () => new Promise<void>((resolve) => { finish = resolve; }), dmsEnabled: () => true });
    store.attach(ME);
    store.hold(wrap('slow'), 'wrap');
    await store.unlock();
    store.attach(null);
    finish();
    await Promise.resolve(); await Promise.resolve();
    expect(store.lock.get()).toEqual({ status: 'locked', unopened: [] });
  });

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

  it('the read-state sync waits for unlock and blocks when DMs are disabled', async () => {
    const { store } = build(fakeSigner());
    const later = vi.fn();
    expect(store.defer(later)).toBe(true);
    await store.unlock();
    expect(later).toHaveBeenCalledTimes(1);
    expect(store.defer(vi.fn())).toBe(false);

    const off = build(fakeSigner(), false).store;
    expect(off.defer(vi.fn())).toBe(true);
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

  it('counts no held wrap until the stored ids are read, so a replayed stored message never shows as new', async () => {
    await dmStoreDb(idb).put(ME, 'stored', { v: 1, iv: 'x', ct: 'y' });
    const store = new DmStoreModule({ nipSigner: () => fakeSigner(), replay: vi.fn(), reingest: vi.fn(), dmsEnabled: () => true });
    const seen: number[][] = [];
    store.lock.subscribe((s) => { seen.push([...s.unopened]); });
    store.attach(ME);
    // The relays replay the stored wrap and send a new one before IndexedDB answers.
    store.hold(wrap('stored', 1), 'wrap');
    store.hold(wrap('new', 2), 'wrap');
    expect(store.lock.get().unopened).toEqual([]);
    await vi.waitFor(() => expect(store.lock.get().unopened).toEqual([2_000]));
    expect(seen.filter((u) => u.includes(1_000))).toEqual([]);
  });

  it('with no IndexedDB there is no index to wait for: a held wrap counts at once', () => {
    vi.stubGlobal('indexedDB', undefined);
    const { store } = build(fakeSigner());
    store.hold(wrap('w', 3), 'wrap');
    expect(store.lock.get().unopened).toEqual([3_000]);
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
