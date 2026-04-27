// src/lib/signer-payload-crypto.ts
// At-rest encryption for the locally-stored signer payload (nsec / bunker
// credentials). Distinct from the DM cache key which uses NIP-44 self-
// encryption — here the signer doesn't exist yet at decrypt time
// (chicken-and-egg), so we use a non-extractable AES-GCM CryptoKey
// kept in IndexedDB instead.
//
// Improves the at-rest threat model: XSS can still call decryptPayload()
// to recover a payload, but it cannot exfiltrate the raw key bytes (the
// CryptoKey is non-extractable). Logout clears the IDB key entry, so a
// subsequent attacker without our app code can't read leftover ciphertext.

const DB_NAME = 'obelisk-signer-crypto';
const DB_VERSION = 1;
const STORE = 'keys';
const KEY_ID = 'wrap-key';

let cachedKey: CryptoKey | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<CryptoKey | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: CryptoKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOrCreateWrapKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const existing = await idbGet(KEY_ID).catch(() => null);
  if (existing) {
    cachedKey = existing;
    return existing;
  }
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    /* extractable */ false,
    ['encrypt', 'decrypt'],
  );
  await idbPut(KEY_ID, key);
  cachedKey = key;
  return key;
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

export async function encryptPayload(plaintext: string): Promise<string> {
  const key = await getOrCreateWrapKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(ct)}`;
}

export async function decryptPayload(blob: string): Promise<string> {
  const key = await getOrCreateWrapKey();
  const [ivB64, ctB64] = blob.split('.');
  if (!ivB64 || !ctB64) throw new Error('malformed payload');
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ctB64);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

/** Called from logout — destroys the IDB key so leftover ciphertext is unreadable. */
export async function clearWrapKey(): Promise<void> {
  cachedKey = null;
  await idbDelete(KEY_ID).catch(() => { /* best-effort */ });
}

/** Test/dev helper. */
export function _resetCache(): void {
  cachedKey = null;
}
