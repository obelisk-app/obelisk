/**
 * A browser-held key for encrypting a secret at rest.
 *
 * One AES-GCM 256 key, generated with `extractable: false`, lives as a
 * `CryptoKey` object in IndexedDB (`obelisk-vault` / `keys` / `session-key`;
 * a caller with a secret of a different lifetime names its own key id).
 * The browser can use it to encrypt and decrypt, but no script, this one
 * included, can read its bytes: `exportKey` on it rejects. What the caller
 * stores elsewhere (localStorage) is only the sealed box: a fresh 12-byte IV
 * and the ciphertext, both base64url, bound to an `aad` string the caller
 * picks (the session's pubkey) so a box copied into another record fails to
 * open.
 *
 * This protects a secret on disk (a copied profile folder, a backup, a script
 * that greps storage files). It does not protect it from code running inside
 * the page, which can call `open()` like the app does.
 *
 * No app imports: a mini-package.
 */
import { exact, fromBase64Url, toBase64Url } from './webcrypto';
import { deleteRecord, getRecord, openStore, putRecord } from './vault-idb';

export const VAULT_DB = 'obelisk-vault';
export const VAULT_STORE = 'keys';
export const VAULT_KEY_ID = 'session-key';

const IV_BYTES = 12;

/** What the caller stores: version, IV and ciphertext (tag appended), base64url. */
export interface SealedBox {
  readonly v: 1;
  readonly iv: string;
  readonly ct: string;
}

export type VaultErrorCode = 'unavailable' | 'unlock-failed' | 'key-missing';

/** The only error the vault throws. `code` says which of the three things went wrong. */
export class VaultError extends Error {
  readonly code: VaultErrorCode;
  constructor(code: VaultErrorCode, message?: string) {
    super(message ?? `Session vault: ${code}`); // i18n-exempt: developer message; readers get the code
    this.name = 'VaultError';
    this.code = code;
  }
}

export interface SessionVault {
  /** Encrypt `plaintext` under the vault key, bound to `aad`. Creates the key on first use. Fresh IV each call. */
  seal(plaintext: Uint8Array, aad: string): Promise<SealedBox>;
  /** Decrypt. `key-missing` when there is no key; `unlock-failed` on a bad tag, wrong `aad` or malformed box. */
  open(box: SealedBox, aad: string): Promise<Uint8Array>;
  /** Replace the key with a new one. Every box sealed before becomes unopenable. */
  rotate(): Promise<void>;
  /** Delete the key. */
  destroy(): Promise<void>;
}

/** Where the vault finds IndexedDB and WebCrypto. Defaults to the page's own; tests pass doubles. */
export interface VaultEnvironment {
  readonly indexedDB?: IDBFactory | null;
  readonly subtle?: SubtleCrypto | null;
  /**
   * Which key in the store this vault uses. Default `VAULT_KEY_ID`, the
   * session's. A secret with its own lifetime (a wallet connection, which
   * must survive the rotation every login does) uses its own id, so rotating
   * or destroying one key never touches a box sealed under the other.
   */
  readonly keyId?: string;
}

/** A structural check for a value read back from storage. */
export function isSealedBox(value: unknown): value is SealedBox {
  if (!value || typeof value !== 'object') return false;
  const box = value as Record<string, unknown>;
  return box.v === 1 && typeof box.iv === 'string' && typeof box.ct === 'string';
}

function aadBytes(aad: string): Uint8Array<ArrayBuffer> {
  return exact(new TextEncoder().encode(aad));
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return !!value && typeof value === 'object' && (value as CryptoKey).type === 'secret';
}

function resolveEnv(env: VaultEnvironment): { factory: IDBFactory | null; subtle: SubtleCrypto | null } {
  const factory = env.indexedDB === undefined ? globalThis.indexedDB : env.indexedDB;
  const subtle = env.subtle === undefined ? globalThis.crypto?.subtle : env.subtle;
  return { factory: factory ?? null, subtle: subtle ?? null };
}

/**
 * Whether this page has what a vault needs (IndexedDB and `crypto.subtle`),
 * answered synchronously. `true` does not promise the database will open:
 * `openSessionVault` can still throw `unavailable`.
 */
export function isVaultAvailable(env: VaultEnvironment = {}): boolean {
  const { factory, subtle } = resolveEnv(env);
  return !!factory && !!subtle;
}

/**
 * Resolve a vault over this browser's IndexedDB. Throws `VaultError('unavailable')`
 * when IndexedDB or `crypto.subtle` is missing or the database will not open
 * (some private modes, storage disabled, a non-secure origin). Never throws
 * anything else, and never creates a key: the first `seal` or `rotate` does.
 */
export async function openSessionVault(env: VaultEnvironment = {}): Promise<SessionVault> {
  const { factory, subtle } = resolveEnv(env);
  if (!factory || !subtle) throw new VaultError('unavailable');
  const keyId = env.keyId ?? VAULT_KEY_ID;

  async function withDb<T>(op: (db: IDBDatabase) => Promise<T>): Promise<T> {
    let db: IDBDatabase;
    try {
      db = await openStore(factory as IDBFactory, VAULT_DB, VAULT_STORE);
    } catch {
      throw new VaultError('unavailable');
    }
    try {
      return await op(db);
    } catch (err) {
      if (err instanceof VaultError) throw err;
      throw new VaultError('unavailable', err instanceof Error ? err.message : undefined);
    } finally {
      db.close();
    }
  }

  const readKey = () => withDb(async (db) => {
    const key = await getRecord<unknown>(db, VAULT_STORE, keyId);
    return isCryptoKey(key) ? key : null;
  });

  async function newKey(): Promise<CryptoKey> {
    let key: CryptoKey;
    try {
      key = await (subtle as SubtleCrypto).generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    } catch {
      throw new VaultError('unavailable');
    }
    await withDb((db) => putRecord(db, VAULT_STORE, keyId, key));
    return key;
  }

  // Fail now, not at the first seal, when the database cannot be opened.
  await withDb(async () => undefined);

  return {
    async seal(plaintext, aad) {
      const key = (await readKey()) ?? (await newKey());
      const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
      let ct: ArrayBuffer;
      try {
        ct = await (subtle as SubtleCrypto).encrypt({ name: 'AES-GCM', iv, additionalData: aadBytes(aad) }, key, exact(plaintext));
      } catch {
        throw new VaultError('unavailable');
      }
      return { v: 1, iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
    },

    async open(box, aad) {
      let iv: Uint8Array<ArrayBuffer>;
      let ct: Uint8Array<ArrayBuffer>;
      try {
        if (!isSealedBox(box)) throw new Error('not a sealed box');
        iv = fromBase64Url(box.iv);
        ct = fromBase64Url(box.ct);
      } catch {
        throw new VaultError('unlock-failed');
      }
      if (iv.byteLength !== IV_BYTES) throw new VaultError('unlock-failed');
      const key = await readKey();
      if (!key) throw new VaultError('key-missing');
      try {
        const plain = await (subtle as SubtleCrypto).decrypt({ name: 'AES-GCM', iv, additionalData: aadBytes(aad) }, key, ct);
        return new Uint8Array(plain);
      } catch {
        throw new VaultError('unlock-failed');
      }
    },

    async rotate() {
      await newKey();
    },

    async destroy() {
      await withDb((db) => deleteRecord(db, VAULT_STORE, keyId));
    },
  };
}
