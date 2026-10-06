/**
 * Where the encrypted DM store lives: IndexedDB database `obelisk-dms`, one
 * object store `records`, two kinds of key per account.
 *
 *   key:<pubkey>              the DM key, wrapped by the signer (`store-key.ts`)
 *   dm:<pubkey>:<wire id>     one AES-256-GCM box per message (`store.ts`)
 *
 * The wire id is the relay event's id (the gift wrap's, or the kind 4's): a
 * public value, already in the wrap ledger, and the store's own index of
 * what it holds. That index is what lets the inbox skip a wrap without
 * asking the signer, and it lives with the records, so removing the records
 * can never leave a "seen" mark behind that would hide a message.
 *
 * Each call opens the database, does one transaction and closes it, so a
 * removal (`deleteDatabase`) is never blocked by this module. Every method
 * throws when IndexedDB fails; the caller decides what that means.
 */
import {
  deleteRecord,
  deleteRecordsWithPrefix,
  getRecord,
  listKeys,
  listRecords,
  openStore,
  putRecord,
} from '@/lib/crypto/vault-idb';
import type { WrappedDmKey } from './store-key';

export const DM_STORE_DB = 'obelisk-dms';
const STORE = 'records';

const keySlot = (pubkey: string) => `key:${pubkey}`;
const recordPrefix = (pubkey: string) => `dm:${pubkey}:`;

export interface StoredBox {
  readonly wireId: string;
  readonly box: unknown;
}

export interface DmStoreDb {
  wrappedKey(pubkey: string): Promise<unknown>;
  saveWrappedKey(pubkey: string, wrapped: WrappedDmKey): Promise<void>;
  /** The wire ids stored for `pubkey`, without opening anything. */
  wireIds(pubkey: string): Promise<string[]>;
  boxes(pubkey: string): Promise<StoredBox[]>;
  put(pubkey: string, wireId: string, box: unknown): Promise<void>;
  remove(pubkey: string, wireId: string): Promise<void>;
  /** The key and every record of `pubkey`. */
  clearAccount(pubkey: string): Promise<void>;
  /** Every record of `pubkey`, keeping the key. */
  clearRecords(pubkey: string): Promise<void>;
}

/** The page's IndexedDB, or null when this browser has none (some private modes, storage off). */
export function pageIndexedDb(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

export function dmStoreDb(factory: IDBFactory): DmStoreDb {
  async function withDb<T>(op: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await openStore(factory, DM_STORE_DB, STORE);
    try {
      return await op(db);
    } finally {
      db.close();
    }
  }
  return {
    wrappedKey: (pubkey) => withDb((db) => getRecord<unknown>(db, STORE, keySlot(pubkey))),
    saveWrappedKey: (pubkey, wrapped) => withDb((db) => putRecord(db, STORE, keySlot(pubkey), wrapped)),
    wireIds: (pubkey) => withDb(async (db) => {
      const prefix = recordPrefix(pubkey);
      return (await listKeys(db, STORE, prefix)).map((k) => k.slice(prefix.length));
    }),
    boxes: (pubkey) => withDb(async (db) => {
      const prefix = recordPrefix(pubkey);
      return (await listRecords<unknown>(db, STORE, prefix)).map(([k, box]) => ({ wireId: k.slice(prefix.length), box }));
    }),
    put: (pubkey, wireId, box) => withDb((db) => putRecord(db, STORE, `${recordPrefix(pubkey)}${wireId}`, box)),
    remove: (pubkey, wireId) => withDb((db) => deleteRecord(db, STORE, `${recordPrefix(pubkey)}${wireId}`)),
    clearAccount: (pubkey) => withDb(async (db) => {
      await deleteRecordsWithPrefix(db, STORE, recordPrefix(pubkey));
      await deleteRecord(db, STORE, keySlot(pubkey));
    }),
    clearRecords: (pubkey) => withDb((db) => deleteRecordsWithPrefix(db, STORE, recordPrefix(pubkey))),
  };
}
