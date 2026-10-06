import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { deleteRecordsWithPrefix, getRecord, listKeys, listRecords, openStore, putRecord } from '@/lib/crypto/vault-idb';

async function seeded() {
  const db = await openStore(new IDBFactory(), 'test-db', 'records');
  for (const key of ['dm:a:1', 'dm:a:2', 'dm:ab:3', 'key:a', 'dm:b:1']) await putRecord(db, 'records', key, { key });
  return db;
}

describe('vault IndexedDB helpers: prefixes', () => {
  it('lists the records and the keys under a prefix, and nothing else', async () => {
    const db = await seeded();
    expect(await listKeys(db, 'records', 'dm:a:')).toEqual(['dm:a:1', 'dm:a:2']);
    expect(await listRecords(db, 'records', 'dm:a:')).toEqual([['dm:a:1', { key: 'dm:a:1' }], ['dm:a:2', { key: 'dm:a:2' }]]);
    expect(await listKeys(db, 'records', 'none:')).toEqual([]);
    db.close();
  });

  it('deletes exactly the records under a prefix', async () => {
    const db = await seeded();
    await deleteRecordsWithPrefix(db, 'records', 'dm:a:');
    expect(await listKeys(db, 'records', '')).toEqual(['dm:ab:3', 'dm:b:1', 'key:a']);
    expect(await getRecord(db, 'records', 'key:a')).toEqual({ key: 'key:a' });
    db.close();
  });
});
