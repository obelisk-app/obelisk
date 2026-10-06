/**
 * Client-side file encryption for NIP-17 kind-15 file messages.
 *
 * AES-256-GCM through WebCrypto with a fresh random key and 12-byte nonce per
 * file. The ciphertext (tag appended, as WebCrypto produces it) is what goes to
 * Blossom; the key and nonce travel only inside the gift-wrapped rumor. Hex is
 * the encoding every NIP-17 client we interoperate with (Amethyst, 0xchat)
 * uses for `decryption-key` / `decryption-nonce`.
 *
 * `x` is the SHA-256 of the *ciphertext* (the blob's Blossom address) and is
 * checked before decrypting, so a server that swaps the blob is caught even
 * though GCM's tag would also reject it. `ox` is the SHA-256 of the plaintext.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export const FILE_CIPHER_ALGORITHM = 'aes-gcm';

export interface EncryptedFile {
  readonly ciphertext: Uint8Array;
  /** 32-byte AES key, hex. */
  readonly key: string;
  /** 12-byte GCM nonce, hex. */
  readonly nonce: string;
  /** SHA-256 of the ciphertext, hex. */
  readonly x: string;
  /** SHA-256 of the plaintext, hex. */
  readonly ox: string;
  /** Plaintext size in bytes. */
  readonly size: number;
}

export class FileIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileIntegrityError';
  }
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto is unavailable (needs a secure context)');
  return s;
}

// WebCrypto wants a BufferSource backed by a plain ArrayBuffer; a Uint8Array
// view over a SharedArrayBuffer or a larger pool would be rejected or read
// the wrong bytes, so copy into an exact-size buffer.
function exact(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  out.set(bytes);
  return out;
}

export async function encryptFile(plaintext: Uint8Array): Promise<EncryptedFile> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonceBytes = crypto.getRandomValues(new Uint8Array(12));
  const key = await subtle().importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv: nonceBytes }, key, exact(plaintext)),
  );
  return {
    ciphertext,
    key: bytesToHex(keyBytes),
    nonce: bytesToHex(nonceBytes),
    x: bytesToHex(sha256(ciphertext)),
    ox: bytesToHex(sha256(plaintext)),
    size: plaintext.byteLength,
  };
}

/**
 * Verify `expectedX` against the ciphertext, then decrypt. Throws
 * {@link FileIntegrityError} on a hash mismatch or a failed GCM tag: both
 * mean the bytes are not the ones the sender encrypted.
 */
export async function decryptFile(
  ciphertext: Uint8Array,
  keyHex: string,
  nonceHex: string,
  expectedX?: string,
): Promise<Uint8Array> {
  if (expectedX && bytesToHex(sha256(ciphertext)) !== expectedX.toLowerCase()) {
    throw new FileIntegrityError('Encrypted file hash does not match');
  }
  let keyBytes: Uint8Array;
  let nonceBytes: Uint8Array;
  try {
    keyBytes = hexToBytes(keyHex);
    nonceBytes = hexToBytes(nonceHex);
  } catch {
    throw new FileIntegrityError('Malformed decryption key or nonce');
  }
  if (keyBytes.length !== 32 && keyBytes.length !== 16) {
    throw new FileIntegrityError('Unsupported AES key length');
  }
  const key = await subtle().importKey('raw', exact(keyBytes), 'AES-GCM', false, ['decrypt']);
  try {
    return new Uint8Array(
      await subtle().decrypt({ name: 'AES-GCM', iv: exact(nonceBytes) }, key, exact(ciphertext)),
    );
  } catch {
    throw new FileIntegrityError('Decryption failed');
  }
}
