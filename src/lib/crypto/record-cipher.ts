/**
 * AES-256-GCM boxes under a key the caller holds in memory.
 *
 * The session vault (`session-vault.ts`) keeps its key in IndexedDB as a
 * non-extractable `CryptoKey`. This is the other arrangement: the key's
 * bytes are kept somewhere else, wrapped (the DM store wraps them to the
 * user's own Nostr key through their signer), and only an unwrapped copy is
 * imported here, non-extractable, for as long as the page needs it. The
 * caller zeroes its byte copy after `importRecordKey`.
 *
 * Every box gets a fresh 12-byte IV and is bound to an `aad` string the
 * caller picks (the record's slot), so a box copied into another slot fails
 * to open. The box shape is the vault's `SealedBox`.
 *
 * No app imports: a mini-package.
 */
import { isSealedBox, type SealedBox } from './session-vault';
import { exact, fromBase64Url, subtle as pageSubtle, toBase64Url } from './webcrypto';

/** AES-256: the key is 32 bytes. */
export const RECORD_KEY_BYTES = 32;

const IV_BYTES = 12;

export type RecordCipherErrorCode = 'bad-key' | 'unopenable';

/** `bad-key`: not 32 bytes, or WebCrypto refused it. `unopenable`: a bad tag, wrong `aad`, or a malformed box. */
export class RecordCipherError extends Error {
  readonly code: RecordCipherErrorCode;
  constructor(code: RecordCipherErrorCode) {
    super(`Record cipher: ${code}`); // i18n-exempt: developer message; readers get the code
    this.name = 'RecordCipherError';
    this.code = code;
  }
}

/** Fresh random key bytes. The caller wraps them, imports them, then zeroes them. */
export function newRecordKeyBytes(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(RECORD_KEY_BYTES)));
}

/** Import key bytes as a non-extractable AES-GCM key: usable, never readable again. */
export async function importRecordKey(raw: Uint8Array, s: SubtleCrypto = pageSubtle()): Promise<CryptoKey> {
  if (raw.byteLength !== RECORD_KEY_BYTES) throw new RecordCipherError('bad-key');
  try {
    return await s.importKey('raw', exact(raw), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } catch {
    throw new RecordCipherError('bad-key');
  }
}

function aadBytes(aad: string): Uint8Array<ArrayBuffer> {
  return exact(new TextEncoder().encode(aad));
}

/** Encrypt `plaintext` under `key`, bound to `aad`. */
export async function sealRecord(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad: string,
  s: SubtleCrypto = pageSubtle(),
): Promise<SealedBox> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const ct = await s.encrypt({ name: 'AES-GCM', iv, additionalData: aadBytes(aad) }, key, exact(plaintext));
  return { v: 1, iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
}

/** Decrypt a box. Throws `RecordCipherError('unopenable')` on any failure, never anything else. */
export async function openRecord(
  key: CryptoKey,
  box: unknown,
  aad: string,
  s: SubtleCrypto = pageSubtle(),
): Promise<Uint8Array> {
  let iv: Uint8Array<ArrayBuffer>;
  let ct: Uint8Array<ArrayBuffer>;
  try {
    if (!isSealedBox(box)) throw new Error('not a sealed box');
    iv = fromBase64Url(box.iv);
    ct = fromBase64Url(box.ct);
  } catch {
    throw new RecordCipherError('unopenable');
  }
  if (iv.byteLength !== IV_BYTES) throw new RecordCipherError('unopenable');
  try {
    return new Uint8Array(await s.decrypt({ name: 'AES-GCM', iv, additionalData: aadBytes(aad) }, key, ct));
  } catch {
    throw new RecordCipherError('unopenable');
  }
}
