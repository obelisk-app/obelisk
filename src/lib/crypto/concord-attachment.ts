import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';

/** CORD imeta's AES-256-GCM format: 16-byte nonce and appended GCM tag. */
export async function sealConcordAttachment(plaintext: Uint8Array) {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new Uint8Array(plaintext)));
  return {
    ciphertext,
    encryption: { algorithm: 'aes-gcm', key: bytesToHex(rawKey), nonce: bytesToHex(nonce) },
    sha256: bytesToHex(sha256(ciphertext)), originalSha256: bytesToHex(sha256(plaintext)),
  };
}

export async function openConcordAttachment(ciphertext: Uint8Array, descriptor: {
  encryption?: { algorithm: string; key: string; nonce: string }; sha256?: string; originalSha256?: string;
}) {
  const encryption = descriptor.encryption;
  if (!encryption || encryption.algorithm !== 'aes-gcm' || !/^[0-9a-f]{64}$/.test(encryption.key) || !/^[0-9a-f]{32}$/.test(encryption.nonce)) throw new Error('Invalid attachment encryption');
  if (descriptor.sha256 && bytesToHex(sha256(ciphertext)) !== descriptor.sha256) throw new Error('Invalid attachment digest');
  const key = await crypto.subtle.importKey('raw', new Uint8Array(hexToBytes(encryption.key)), 'AES-GCM', false, ['decrypt']);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(hexToBytes(encryption.nonce)) }, key, new Uint8Array(ciphertext)));
  if (descriptor.originalSha256 && bytesToHex(sha256(plaintext)) !== descriptor.originalSha256) throw new Error('Invalid attachment plaintext digest');
  return plaintext;
}
