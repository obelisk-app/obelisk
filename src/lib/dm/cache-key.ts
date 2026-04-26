/**
 * Per-account symmetric cache key. The 32-byte raw key is generated locally,
 * NIP-44-self-encrypted by the user's signer (so only their nsec/extension/
 * bunker can recover it), and persisted in that wrapped form. On unwrap we
 * import as a non-extractable WebCrypto AES-GCM key — XSS can call our
 * encrypt/decrypt helpers but cannot exfiltrate the raw bytes.
 */

interface KEKSigner {
  pubkey: string;
  nip44Encrypt(recipientPubkey: string, plaintext: string): Promise<string>;
  nip44Decrypt(senderPubkey: string, ciphertext: string): Promise<string>;
}

const KEY_PREFIX = 'obelisk:dm-cache-key:';

const ramKeys = new Map<string, CryptoKey>();

export function _resetCacheKeyState(): void {
  ramKeys.clear();
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function getOrCreateCacheKey(myPubkey: string, signer: KEKSigner): Promise<CryptoKey> {
  const cached = ramKeys.get(myPubkey);
  if (cached) return cached;

  const storageKey = KEY_PREFIX + myPubkey;
  let rawB64: string;

  const wrapped = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
  if (wrapped) {
    rawB64 = await signer.nip44Decrypt(myPubkey, wrapped);
  } else {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    rawB64 = bytesToBase64(raw);
    const wrappedNew = await signer.nip44Encrypt(myPubkey, rawB64);
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, wrappedNew);
  }

  const raw = base64ToBytes(rawB64);
  const key = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    /* extractable */ false,
    ['encrypt', 'decrypt'],
  );

  // Defensive zero of the post-import buffer. Note: the raw key also lives in
  // the immutable base64 string above until GC, so this is best-effort and
  // closes only one of several windows.
  raw.fill(0);

  ramKeys.set(myPubkey, key);
  return key;
}

export async function encryptToCache(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  // Pack as base64(iv) + '.' + base64(ct)
  return `${bytesToBase64(iv)}.${bytesToBase64(ct)}`;
}

export async function decryptFromCache(key: CryptoKey, blob: string): Promise<string> {
  const [ivB64, ctB64] = blob.split('.');
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ctB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}
