import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  VAULT_DB,
  VAULT_KEY_ID,
  VAULT_STORE,
  VaultError,
  isSealedBox,
  isVaultAvailable,
  openSessionVault,
  type SealedBox,
} from '@/lib/crypto/session-vault';
import { getRecord, openStore } from '@/lib/crypto/vault-idb';

const PUB = 'a'.repeat(64);
const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

let idb: IDBFactory;

beforeEach(() => {
  idb = new IDBFactory();
});

const vault = () => openSessionVault({ indexedDB: idb });

async function storedKey(): Promise<unknown> {
  const db = await openStore(idb, VAULT_DB, VAULT_STORE);
  try {
    return await getRecord(db, VAULT_STORE, VAULT_KEY_ID);
  } finally {
    db.close();
  }
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(VaultError);
    return (err as VaultError).code;
  }
  throw new Error('expected a VaultError');
}

describe('session vault', () => {
  it('seals and opens a round trip; two seals of the same bytes differ in iv and ct', async () => {
    const v = await vault();
    const a = await v.seal(bytes('secret'), PUB);
    const b = await v.seal(bytes('secret'), PUB);
    expect(isSealedBox(a)).toBe(true);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    expect(text(await v.open(a, PUB))).toBe('secret');
    expect(text(await v.open(b, PUB))).toBe('secret');
    expect(a.ct).not.toContain('secret');
  });

  it('refuses a box opened under a different aad', async () => {
    const v = await vault();
    const box = await v.seal(bytes('secret'), PUB);
    expect(await codeOf(v.open(box, 'b'.repeat(64)))).toBe('unlock-failed');
  });

  it('a rotated key cannot open old boxes; a destroyed key is missing', async () => {
    const v = await vault();
    const box = await v.seal(bytes('secret'), PUB);
    await v.rotate();
    expect(await codeOf(v.open(box, PUB))).toBe('unlock-failed');
    const fresh = await v.seal(bytes('again'), PUB);
    expect(text(await v.open(fresh, PUB))).toBe('again');
    await v.destroy();
    expect(await storedKey()).toBeUndefined();
    expect(await codeOf(v.open(fresh, PUB))).toBe('key-missing');
  });

  it('a second vault over the same database opens what the first sealed (a reload)', async () => {
    const box = await (await vault()).seal(bytes('secret'), PUB);
    expect(text(await (await vault()).open(box, PUB))).toBe('secret');
  });

  it('stores a non-extractable key: exportKey on the stored object rejects', async () => {
    const v = await vault();
    await v.seal(bytes('secret'), PUB);
    const key = (await storedKey()) as CryptoKey;
    expect(key.type).toBe('secret');
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('opening the vault creates no key; only a seal or a rotate does', async () => {
    await vault();
    expect(await storedKey()).toBeUndefined();
  });

  it('answers availability synchronously from what the page has', () => {
    expect(isVaultAvailable({ indexedDB: idb })).toBe(true);
    expect(isVaultAvailable({ indexedDB: null })).toBe(false);
    expect(isVaultAvailable({ indexedDB: idb, subtle: null })).toBe(false);
  });

  it('is unavailable without IndexedDB, without crypto.subtle, or when the database will not open', async () => {
    expect(await codeOf(openSessionVault({ indexedDB: null }))).toBe('unavailable');
    expect(await codeOf(openSessionVault({ indexedDB: idb, subtle: null }))).toBe('unavailable');
    const broken = { open: () => { throw new Error('SecurityError'); } } as unknown as IDBFactory;
    expect(await codeOf(openSessionVault({ indexedDB: broken }))).toBe('unavailable');
  });

  it('a malformed box fails as unlock-failed, never as a raw DOMException', async () => {
    const v = await vault();
    const good = await v.seal(bytes('secret'), PUB);
    const shortIv = { ...good, iv: good.iv.slice(0, 14) };
    const notBase64 = { ...good, ct: 'not base64!' };
    const wrongShape = { v: 2, iv: good.iv, ct: good.ct } as unknown as SealedBox;
    const flipped = { ...good, ct: (good.ct[0] === 'A' ? 'B' : 'A') + good.ct.slice(1) };
    for (const box of [shortIv, notBase64, wrongShape, flipped]) {
      expect(await codeOf(v.open(box, PUB))).toBe('unlock-failed');
    }
  });
});
