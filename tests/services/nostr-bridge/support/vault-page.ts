/**
 * What the session-vault suites share: a fresh fake IndexedDB per test, a
 * page reload that keeps both storages, and the scan that proves a secret is
 * nowhere on disk. Used on top of `installBridgeHarness`.
 */
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { VAULT_DB, VAULT_KEY_ID, VAULT_STORE } from '@/lib/crypto/session-vault';
import { deleteRecord, getRecord, openStore } from '@/lib/crypto/vault-idb';
import { hexToBytesForTest } from '@tests/services/nostr-bridge/support/bridge-harness';
import { unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';

export const SESSION_KEY = 'obelisk-dex/session';
export const SDK_NIP46_KEY = '@nostr-wot/ui:nip46';
export const SDK_NSEC_KEY = '@nostr-wot/ui:nsec';

let idb: IDBFactory | null = null;

/** Give every test its own empty IndexedDB as the page's `indexedDB`. */
export function installVaultPage(): void {
  beforeEach(() => {
    idb = new IDBFactory();
    vi.stubGlobal('indexedDB', idb);
  });
}

/** This browser has no IndexedDB (some private modes, storage disabled). */
export function removeIndexedDb(): void {
  vi.stubGlobal('indexedDB', undefined);
}

async function withVaultDb<T>(op: (db: IDBDatabase) => Promise<T>): Promise<T> {
  if (!idb) throw new Error('installVaultPage() has not run');
  const db = await openStore(idb, VAULT_DB, VAULT_STORE);
  try {
    return await op(db);
  } finally {
    db.close();
  }
}

export const vaultKey = () => withVaultDb((db) => getRecord<CryptoKey>(db, VAULT_STORE, VAULT_KEY_ID));
export const deleteVaultKey = () => withVaultDb((db) => deleteRecord(db, VAULT_STORE, VAULT_KEY_ID));

/** Dispose this page's bridge and load a new one over the same storage, as a reload does. */
export async function reload() {
  const before = await import('@/services/nostr-bridge/facade/client');
  before.getBridgeImpl()?.dispose();
  // The bridge lives in a globalThis slot that survives a module reset (so a
  // dev hot reload finds it); a real reload starts with that slot empty.
  unregisterBridge();
  vi.resetModules();
  const client = await import('@/services/nostr-bridge/facade/client');
  const bridge = await client.getBridge();
  return { bridge, impl: client.getBridgeImpl()! };
}

export function storedRecord(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

function everyStoredString(): string[] {
  const out: string[] = [];
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)!;
      out.push(key, storage.getItem(key) ?? '');
    }
  }
  return out;
}

/**
 * Scan every key and value in localStorage and sessionStorage for each
 * secret, case-insensitively. For a 64-hex private key the nsec spelling is
 * scanned too.
 */
export function expectNowhereOnDisk(...secrets: string[]): void {
  const needles = secrets.flatMap((s) => (/^[0-9a-f]{64}$/i.test(s) ? [s, nip19.nsecEncode(hexToBytesForTest(s))] : [s]));
  const stored = everyStoredString().map((s) => s.toLowerCase());
  for (const needle of needles) {
    const hits = stored.filter((s) => s.includes(needle.toLowerCase()));
    expect(hits, `secret found in storage: ${needle.slice(0, 8)}...`).toEqual([]);
  }
}
