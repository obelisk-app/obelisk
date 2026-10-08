'use client';

import {
  uploadToBlossom as uploadBlob,
  uploadEncryptedBlob as uploadCiphertext,
} from '@nostr-wot/blossom';
import { PrivateKeySigner } from '@nostr-wot/signers';
import type { BlossomUploadOptions } from '@/types/media/blossom';
import { nostrActions } from '@/services/nostr-bridge';
import { BLOSSOM_SERVERS, ENCRYPTED_BLOSSOM_SERVERS } from '@/constants/media/blossom';

export { BlossomUploadError } from '@nostr-wot/blossom';

/** Select the application's signer and servers; the SDK owns the upload protocol. */
export async function uploadToBlossom(file: File, secretKey?: Uint8Array, options: BlossomUploadOptions = {}): Promise<string> {
  const signer = secretKey
    ? new PrivateKeySigner(secretKey)
    : { signEvent: options.signEventTemplate ?? nostrActions.signEventTemplate };
  const blob = await uploadBlob(file, {
    signer,
    servers: BLOSSOM_SERVERS,
    contentType: file.type || 'application/octet-stream',
    assertActive: options.assertCurrent,
  });
  return blob.url;
}

/** Opaque DM attachments use separate servers and the SDK's per-upload ephemeral identity. */
export async function uploadEncryptedBlob(
  ciphertext: Uint8Array,
  servers: readonly string[] = ENCRYPTED_BLOSSOM_SERVERS,
): Promise<string> {
  const blob = await uploadCiphertext(ciphertext, { servers });
  return blob.url;
}
