import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openConcordStorage } from '@/services/nostr-bridge/concord/storage';
import { CONCORD_DB, CONCORD_STORE } from '@/constants/nostr-bridge/concord';
import { listRecords, openStore, putRecord } from '@/lib/crypto/vault-idb';
import { openSessionVault } from '@/lib/crypto/session-vault';

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Concord encrypted account storage', () => {
  it('seals values, hides membership names, survives session key rotation and isolates accounts', async () => {
    const storage = await openConcordStorage('a'.repeat(64), () => {});
    const key = 'community-private-identifier';
    await storage.setItem(key, 'community-root-secret');
    const db = await openStore(indexedDB, CONCORD_DB, CONCORD_STORE);
    const records = await listRecords(db, CONCORD_STORE, '');
    db.close();
    expect(JSON.stringify(records)).not.toContain(key);
    expect(JSON.stringify(records)).not.toContain('community-root-secret');
    await (await openSessionVault()).rotate();
    const restored = await openConcordStorage('a'.repeat(64), () => {});
    expect(await restored.getItem(key)).toBe('community-root-secret');
    expect(await (await openConcordStorage('b'.repeat(64), () => {})).getItem(key)).toBeNull();
    await restored.removeItem(key);
    expect(await restored.getItem(key)).toBeNull();
  });

  it('rejects moved ciphertext and rejects stale session writes', async () => {
    let active = true;
    const storage = await openConcordStorage('a'.repeat(64), () => { if (!active) throw new Error('retired'); });
    await storage.setItem('one', 'first secret');
    await storage.setItem('two', 'second secret');
    const db = await openStore(indexedDB, CONCORD_DB, CONCORD_STORE);
    const records = await listRecords(db, CONCORD_STORE, '');
    await putRecord(db, CONCORD_STORE, records[0][0], records[1][1]);
    db.close();
    const results = await Promise.allSettled([storage.getItem('one'), storage.getItem('two')]);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    active = false;
    await expect(storage.setItem('three', 'stale secret')).rejects.toThrow('retired');
    await expect(storage.getItem('two')).rejects.toThrow('retired');
  });
});
