import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { openSessionVault, isSealedBox, type SealedBox } from '@/lib/crypto/session-vault';
import { openStore, getRecord, putRecord, deleteRecord, listRecords, applyStagedRecords } from '@/lib/crypto/vault-idb';
import { CONCORD_BACKUP_MAX_BYTES, CONCORD_DB, CONCORD_STORE, CONCORD_VAULT_PREFIX } from '@/constants/nostr-bridge/concord';

/** Dedicated account key: normal session-key rotation must not erase memberships. */
export async function openConcordStorage(pubkey: string, assertCurrent: () => void) {
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
  const prefix = `${pubkey}:`;
  const stageKey = `restore:${pubkey}`;
  const slot = (key: string) => `${pubkey}:${bytesToHex(sha256(new TextEncoder().encode(key)))}`;
  return {
    async snapshot() {
      const stored = await withDb(db => listRecords(db, CONCORD_STORE, prefix));
      const rows: Array<[string, string]> = [];
      let size = 0;
      for (const [address, box] of stored) {
        if (!isSealedBox(box)) throw new Error('Invalid Concord cache record');
        size += box.ct.length;
        if (size > CONCORD_BACKUP_MAX_BYTES) throw new Error('Concord backup is too large');
        const value = await vault.open(box, address);
        assertCurrent();
        rows.push([address.slice(prefix.length), new TextDecoder().decode(value)]);
      }
      return rows;
    },
    async stageRestore(rows: Array<[string, string]>) {
      const boxes: Array<readonly [string, SealedBox]> = [];
      for (const [slot, value] of rows) {
        assertCurrent();
        const address = prefix + slot;
        boxes.push([address, await vault.seal(new TextEncoder().encode(value), address)] as const);
      }
      await withDb(db => putRecord(db, CONCORD_STORE, stageKey, boxes));
    },
    async applyRestore() {
      await withDb(db => applyStagedRecords(db, CONCORD_STORE, prefix, stageKey));
    },
    async getItem(key: string) {
      const address = slot(key);
      const box = await withDb(db => getRecord(db, CONCORD_STORE, address));
      if (box === undefined) return null;
      if (!isSealedBox(box)) throw new Error('Invalid Concord cache record');
      const bytes = await vault.open(box, address);
      assertCurrent();
      return new TextDecoder().decode(bytes);
    },
    async setItem(key: string, value: string) {
      assertCurrent();
      const address = slot(key);
      const box = await vault.seal(new TextEncoder().encode(value), address);
      await withDb(db => putRecord(db, CONCORD_STORE, address, box));
    },
    async removeItem(key: string) {
      await withDb(db => deleteRecord(db, CONCORD_STORE, slot(key)));
    },
  };
}
