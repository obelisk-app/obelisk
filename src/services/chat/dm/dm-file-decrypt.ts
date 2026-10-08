/**
 * Fetch a NIP-17 kind-15 attachment's ciphertext from Blossom, check it
 * against `x`, decrypt it in memory and hand back an object URL.
 *
 * Nothing decrypted touches disk (docs/features/direct-messages.md: no DM plaintext
 * on disk). The caller owns the returned URL and must revoke it.
 */

import { decryptFile } from '@nostr-wot/dm';
import type { JsDmFile } from '@/utils/attachments/dm-file';

/** Fetch, verify and decrypt; resolves to a fresh object URL the caller owns. */
export async function fetchDecrypted(file: JsDmFile, signal: AbortSignal): Promise<string> {
  const res = await fetch(file.url, { signal, referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cipher = new Uint8Array(await res.arrayBuffer());
  const plain = await decryptFile(cipher, file.key, file.nonce, file.x || undefined);
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  return URL.createObjectURL(new Blob([plain as Uint8Array<ArrayBuffer>], { type: file.mimeType }));
}
