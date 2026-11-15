import type { ConcordStorage } from '@applesauce/concord/client';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { openSessionVault, isSealedBox } from '@/lib/crypto/session-vault';
import { openStore, getRecord, putRecord, deleteRecord } from '@/lib/crypto/vault-idb';
import { CONCORD_DB, CONCORD_STORE, CONCORD_VAULT_PREFIX } from '@/constants/nostr-bridge/concord';

/** Dedicated account key: normal session-key rotation must not erase memberships. */
export async function openConcordStorage(pubkey: string, assertCurrent: () => void): Promise<ConcordStorage> {
  const vault = await openSessionVault({ keyId: CONCORD_VAULT_PREFIX + pubkey });
  const withDb = async <T>(operation: (db: IDBDatabase) => Promise<T>) => {
    assertCurrent();
    const db = await openStore(indexedDB, CONCORD_DB, CONCORD_STORE);
    try {
      assertCurrent();
      const result = await operation(db);
      assertCurrent();
      return result;
    } finally { db.close(); }
  };
  const slot = (key: string) => `${pubkey}:${bytesToHex(sha256(new TextEncoder().encode(key)))}`;
  return {
    async getItem(key) {
      const address = slot(key);
      const box = await withDb(db => getRecord(db, CONCORD_STORE, address));
      if (box === undefined) return null;
      if (!isSealedBox(box)) throw new Error('Invalid Concord cache record');
      const bytes = await vault.open(box, address);
      assertCurrent();
      return new TextDecoder().decode(bytes);
    },
    async setItem(key, value) {
      assertCurrent();
      const address = slot(key);
      const box = await vault.seal(new TextEncoder().encode(value), address);
      await withDb(db => putRecord(db, CONCORD_STORE, address, box));
    },
    async removeItem(key) {
      await withDb(db => deleteRecord(db, CONCORD_STORE, slot(key)));
    },
  };
}
