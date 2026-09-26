'use client';

/**
 * Send a file into a NIP-17 DM thread, end-to-end encrypted.
 *
 *   1. Check the mime / size against the same allowlist and caps the group
 *      composer uses (`src/lib/attachments.ts`).
 *   2. AES-256-GCM encrypt in the browser (`src/lib/crypto/file-cipher.ts`).
 *   3. Upload only the ciphertext to Blossom, signed by a throwaway key
 *      (`uploadEncryptedBlob`), so the server learns neither the content nor
 *      who stored it.
 *   4. Hand URL + key + nonce + hashes to the bridge, which seals them into a
 *      kind-15 rumor and gift-wraps it exactly like a text message.
 *
 * The plaintext never leaves this tab except inside the gift wrap's key.
 */

import { encryptFile, FILE_CIPHER_ALGORITHM } from '@/lib/crypto/file-cipher';
import { uploadEncryptedBlob } from '@/lib/blossom';
import { isAllowedMime, isImageMime, maxBytesFor } from '@/lib/attachments';
import type { JsDmFile } from '@/lib/dm-file';

export type DmAttachmentError = 'type' | 'size';

/**
 * `MediaRecorder` reports `audio/webm;codecs=opus`; the allowlist holds bare
 * types. Strip parameters before checking or every voice note is refused.
 */
export function baseMime(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

export function checkDmAttachment(file: File): DmAttachmentError | null {
  const mime = baseMime(file.type);
  if (!isAllowedMime(mime)) return 'type';
  if (file.size > maxBytesFor(mime)) return 'size';
  return null;
}

async function imageDimensions(file: File): Promise<{ width: number; height: number } | undefined> {
  if (!isImageMime(file.type) || typeof createImageBitmap !== 'function') return undefined;
  try {
    const bmp = await createImageBitmap(file);
    const dim = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return dim;
  } catch {
    return undefined;
  }
}

/** Encrypt + upload; returns the metadata the kind-15 rumor carries. */
export async function encryptAndUploadDmFile(
  file: File,
  opts: { durationSeconds?: number } = {},
): Promise<JsDmFile> {
  const problem = checkDmAttachment(file);
  if (problem) throw new Error(problem === 'type' ? 'Unsupported file type' : 'File too large');
  const plaintext = new Uint8Array(await file.arrayBuffer());
  const [enc, dim] = await Promise.all([encryptFile(plaintext), imageDimensions(file)]);
  const url = await uploadEncryptedBlob(enc.ciphertext);
  return {
    url,
    mimeType: baseMime(file.type),
    algorithm: FILE_CIPHER_ALGORITHM,
    key: enc.key,
    nonce: enc.nonce,
    x: enc.x,
    ox: enc.ox,
    size: enc.size,
    dim,
    name: file.name || undefined,
    ...(typeof opts.durationSeconds === 'number' ? { durationSeconds: opts.durationSeconds } : {}),
  };
}

