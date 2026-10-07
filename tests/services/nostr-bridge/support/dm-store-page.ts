/**
 * What the encrypted DM store suites share, on top of `installBridgeHarness`
 * and `installVaultPage`: a counting NIP-07 extension with real crypto,
 * inbound DMs from another key, turning DMs on and watching a thread, and
 * the scan that reads every string this page keeps on disk (both web
 * storages and every IndexedDB database) to prove a message text is not
 * there.
 */
import { expect, vi } from 'vitest';
import { finalizeEvent, nip04, type Event as NostrEvent } from 'nostr-tools';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { DM_STORE_DB } from '@/constants/nostr-bridge/dm';
import { hexToBytesForTest } from '@tests/services/nostr-bridge/support/bridge-harness';
import type { BridgeImpl, JsDirectMessage } from '@/services/nostr-bridge';

export interface TestKeys {
  readonly sk: Uint8Array;
  readonly skHex: string;
  readonly pkHex: string;
}

export function keysFrom(k: { skHex: string; pkHex: string }): TestKeys {
  return { ...k, sk: hexToBytesForTest(k.skHex) };
}

/** A NIP-07 extension for `keys` doing real crypto, every method a spy. Replaces any installed before. */
export function installExtension(keys: TestKeys) {
  const conv = (pk: string) => nip44.utils.getConversationKey(keys.sk, pk);
  const ext = {
    getPublicKey: vi.fn(async () => keys.pkHex),
    signEvent: vi.fn(async (t: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(t, keys.sk)),
    nip04: {
      encrypt: vi.fn(async (pk: string, text: string) => nip04.encrypt(keys.sk, pk, text)),
      decrypt: vi.fn(async (pk: string, ct: string) => nip04.decrypt(keys.sk, pk, ct)),
    },
    nip44: {
      encrypt: vi.fn(async (pk: string, text: string) => nip44.encrypt(text, conv(pk))),
      decrypt: vi.fn(async (pk: string, ct: string) => nip44.decrypt(ct, conv(pk))),
    },
  };
  Object.defineProperty(window, 'nostr', { configurable: true, value: ext });
  return ext;
}

export function removeExtension(): void {
  delete (window as unknown as { nostr?: unknown }).nostr;
}

/** A NIP-17 gift wrap from `from` to `toPk`, as another client would send it. */
export async function giftWrapFrom(from: TestKeys, toPk: string, text: string): Promise<NostrEvent> {
  const { PrivateKeySigner } = await import('@nostr-wot/signers');
  const { buildChatMessage, sealAndGiftWrap } = await import('@nostr-wot/dm');
  return sealAndGiftWrap(new PrivateKeySigner(from.sk), toPk, buildChatMessage(from.pkHex, toPk, text));
}

/** A NIP-04 kind 4 from `from` to `toPk`. */
export function kind4From(from: TestKeys, toPk: string, text: string, createdAt = Math.floor(Date.now() / 1000)): NostrEvent {
  return finalizeEvent({ kind: 4, created_at: createdAt, tags: [['p', toPk]], content: nip04.encrypt(from.sk, toPk, text) }, from.sk);
}

/** Turn DMs on and watch every thread, as the shell's DM anchor does. */
export async function watchDms(bridge: BridgeImpl): Promise<() => Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>> {
  const { setPreference } = await import('@/services/preferences/preferences');
  setPreference('directMessagesEnabled', true);
  let latest: Readonly<Record<string, ReadonlyArray<JsDirectMessage>>> = {};
  bridge.subscribeDirectMessages((byPeer) => { latest = byPeer; });
  return () => latest;
}

/** Wait until `peer`'s thread holds `n` messages, and return their texts in order. */
export async function threadTexts(read: () => Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>, peer: string, n: number): Promise<string[]> {
  return vi.waitFor(() => {
    const thread = read()[peer] ?? [];
    if (thread.length < n) throw new Error(`thread has ${thread.length} of ${n}`);
    return thread.map((m) => m.content);
  }, { timeout: 5000, interval: 5 });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function databaseEntries(factory: IDBFactory, name: string): Promise<Array<[string, unknown]>> {
  const db = await request(factory.open(name));
  try {
    const out: Array<[string, unknown]> = [];
    for (const store of Array.from(db.objectStoreNames)) {
      const tx = db.transaction(store, 'readonly');
      const keys = await request(tx.objectStore(store).getAllKeys());
      const values = await request(tx.objectStore(store).getAll());
      keys.forEach((k, i) => out.push([String(k), values[i]]));
    }
    return out;
  } finally {
    db.close();
  }
}

/** Every `[key, value]` in the encrypted DM store. */
export async function dmStoreEntries(): Promise<Array<[string, unknown]>> {
  const factory = globalThis.indexedDB;
  const names = (await factory.databases()).map((d) => d.name);
  return names.includes(DM_STORE_DB) ? databaseEntries(factory, DM_STORE_DB) : [];
}

export async function dmStoreExists(): Promise<boolean> {
  const factory = globalThis.indexedDB;
  return !!factory && (await factory.databases()).some((d) => d.name === DM_STORE_DB);
}

/** Every key and value this page keeps on disk, as strings: both web storages and every IndexedDB database. */
export async function everythingOnDisk(): Promise<string[]> {
  const out: string[] = [];
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)!;
      out.push(key, storage.getItem(key) ?? '');
    }
  }
  const factory = globalThis.indexedDB as IDBFactory | undefined;
  if (factory) {
    for (const { name } of await factory.databases()) {
      for (const [k, v] of await databaseEntries(factory, name!)) out.push(k, JSON.stringify(v) ?? '');
    }
  }
  return out;
}

/** No DM text anywhere on disk, case-insensitively, whole or in part (the old bell kept the first 280 characters). */
export async function expectNoPlaintextOnDisk(...texts: string[]): Promise<void> {
  const stored = (await everythingOnDisk()).map((s) => s.toLowerCase());
  for (const text of texts) {
    const needle = text.slice(0, 24).toLowerCase();
    const hits = stored.filter((s) => s.includes(needle));
    expect(hits, `DM text found on disk: ${needle}`).toEqual([]);
  }
}

