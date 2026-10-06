/**
 * The IndexedDB operations the crypto stores need, as promises: open a
 * database with one object store; get, put or delete one record; list or
 * delete every record under a key prefix. Each call opens its own short
 * transaction; the caller closes the database.
 */

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Open (creating on first use) `name` with a single key-value object store `store`. */
export function openStore(factory: IDBFactory, name: string, store: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(name, 1);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

export async function getRecord<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  const tx = db.transaction(store, 'readonly');
  const value = await request(tx.objectStore(store).get(key));
  await done(tx);
  return value as T | undefined;
}

export async function putRecord(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await done(tx);
}

export async function deleteRecord(db: IDBDatabase, store: string, key: string): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

/**
 * Walk every record whose key starts with `prefix`. A cursor over the whole
 * store, filtered here, rather than a key range: `IDBKeyRange` is a separate
 * global some environments lack, and these stores hold hundreds of records,
 * not millions.
 */
function walkPrefix(
  db: IDBDatabase,
  store: string,
  prefix: string,
  mode: IDBTransactionMode,
  visit: (cursor: IDBCursorWithValue) => void,
): Promise<void> {
  const tx = db.transaction(store, mode);
  const req = tx.objectStore(store).openCursor();
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) visit(cursor);
    cursor.continue();
  };
  return done(tx);
}

/** Every `[key, value]` whose key starts with `prefix`, in key order. */
export async function listRecords<T>(db: IDBDatabase, store: string, prefix: string): Promise<Array<[string, T]>> {
  const out: Array<[string, T]> = [];
  await walkPrefix(db, store, prefix, 'readonly', (cursor) => out.push([cursor.key as string, cursor.value as T]));
  return out;
}

/** Every key that starts with `prefix`, without reading the values' meaning. */
export async function listKeys(db: IDBDatabase, store: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  await walkPrefix(db, store, prefix, 'readonly', (cursor) => out.push(cursor.key as string));
  return out;
}

/** Delete every record whose key starts with `prefix`. */
export async function deleteRecordsWithPrefix(db: IDBDatabase, store: string, prefix: string): Promise<void> {
  await walkPrefix(db, store, prefix, 'readwrite', (cursor) => { cursor.delete(); });
}
