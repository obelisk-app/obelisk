import type { ConcordUploader } from '@applesauce/concord/client';
import type { MediaAttachment } from '@applesauce/concord/helpers';
import { sealConcordAttachment, openConcordAttachment } from '@/lib/crypto/concord-attachment';
import { uploadEncryptedBlob } from '@/services/media/blossom';
import { CONCORD_ATTACHMENT_BYTE_LIMIT } from '@/constants/nostr-bridge/concord';

export function concordUploader(assertCurrent: () => void): ConcordUploader {
  return {
    async upload(file, _community, options) {
      assertCurrent();
      if (file.size > CONCORD_ATTACHMENT_BYTE_LIMIT) throw new Error('Attachment too large');
      options?.onProgress?.('encrypting');
      const encrypted = await sealConcordAttachment(new Uint8Array(await file.arrayBuffer()));
      assertCurrent();
      options?.onProgress?.('uploading');
      const url = await uploadEncryptedBlob(encrypted.ciphertext);
      assertCurrent();
      return { url, type: file.type || 'application/octet-stream', size: encrypted.ciphertext.length,
        encryption: encrypted.encryption, sha256: encrypted.sha256, originalSha256: encrypted.originalSha256 };
    },
  };
}

/** Bounded fetch of opaque bytes for attachments and authenticated branding. */
export async function fetchConcordCiphertext(url: string, limit = CONCORD_ATTACHMENT_BYTE_LIMIT + 16) {
  if (new URL(url).protocol !== 'https:') throw new Error('Invalid encrypted attachment');
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error('Attachment unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) throw new Error('Attachment too large');
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  const ciphertext = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { ciphertext.set(chunk, offset); offset += chunk.length; }
  return ciphertext;
}

/** User-triggered only. Ciphertext is bounded before decrypting; plaintext is never cached. */
export async function readConcordAttachment(attachment: MediaAttachment) {
  if (!attachment.url || attachment.encryptionError || !attachment.encryption) throw new Error('Invalid encrypted attachment');
  return openConcordAttachment(await fetchConcordCiphertext(attachment.url), attachment);
}

export async function downloadConcordAttachment(attachment: MediaAttachment) {
  const plaintext = await readConcordAttachment(attachment);
  const url = URL.createObjectURL(new Blob([plaintext], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'attachment';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
