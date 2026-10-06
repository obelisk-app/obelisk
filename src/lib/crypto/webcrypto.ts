/**
 * The WebCrypto plumbing the crypto mini-packages share: the `subtle`
 * availability guard, the exact-buffer copy WebCrypto wants, and base64url
 * for storing bytes in JSON. No app imports.
 */

/** `crypto.subtle`, or a throw when the page is not a secure context. */
export function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto is unavailable (needs a secure context)');
  return s;
}

/**
 * WebCrypto wants a BufferSource backed by a plain ArrayBuffer; a Uint8Array
 * view over a SharedArrayBuffer or a larger pool would be rejected or read
 * the wrong bytes, so copy into an exact-size buffer.
 */
export function exact(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  out.set(bytes);
  return out;
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** Bytes as unpadded base64url. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Unpadded base64url back to bytes. Throws on anything that is not base64url. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL.test(text) || text.length % 4 === 1) throw new Error('Malformed base64url');
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
