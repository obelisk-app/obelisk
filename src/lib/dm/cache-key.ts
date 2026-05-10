/**
 * Per-account symmetric cache key — thin shim over `@nostr-wot/dm/cache`.
 *
 * The SDK exposes the same KEK-wrapped AES-GCM primitive (a 32-byte raw key
 * generated locally, NIP-44-self-encrypted by the user's signer, imported
 * into WebCrypto as a non-extractable AES-GCM key). We forward to it but
 * pin the localStorage namespace to `obelisk:dm-cache-key:` so users with
 * pre-existing wrapped keys (and the wallet `local-store.ts` blobs they
 * encrypt) keep decrypting after the SDK migration.
 *
 * `KEKSigner` stays as a structural alias of `NostrSigner` — wallet
 * callers depend on it.
 */

import {
  getOrCreateCacheKey as sdkGetOrCreateCacheKey,
  encryptToCache as sdkEncryptToCache,
  decryptFromCache as sdkDecryptFromCache,
  _resetCacheKeyState as sdkResetCacheKeyState,
} from '@nostr-wot/dm/cache';
import type { NostrSigner } from '@nostr-wot/signers';

/**
 * Structural type for what the cache-key wrapper needs out of a signer:
 * a self-pubkey + NIP-44 encrypt/decrypt. Compatible with `NostrSigner`
 * from `@nostr-wot/signers` so callers can pass either shape.
 */
export interface KEKSigner {
  pubkey: string;
  nip44Encrypt(recipientPubkey: string, plaintext: string): Promise<string>;
  nip44Decrypt(senderPubkey: string, ciphertext: string): Promise<string>;
}

const STORAGE_KEY_PREFIX = 'obelisk:dm-cache-key:';

export function _resetCacheKeyState(): void {
  sdkResetCacheKeyState();
}

export async function getOrCreateCacheKey(
  myPubkey: string,
  signer: KEKSigner,
): Promise<CryptoKey> {
  // SDK's `getOrCreateCacheKey` only consults `nip44Encrypt` /
  // `nip44Decrypt`; the rest of the `NostrSigner` surface (`getPublicKey`,
  // `signEvent`) is unused. The double-cast keeps the legacy `KEKSigner`
  // shape callable from wallet code without forcing them to upgrade to
  // the full `NostrSigner` interface.
  return sdkGetOrCreateCacheKey(
    myPubkey,
    signer as unknown as NostrSigner,
    { storageKeyPrefix: STORAGE_KEY_PREFIX },
  );
}

export async function encryptToCache(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  return sdkEncryptToCache(key, plaintext);
}

export async function decryptFromCache(
  key: CryptoKey,
  blob: string,
): Promise<string> {
  return sdkDecryptFromCache(key, blob);
}
