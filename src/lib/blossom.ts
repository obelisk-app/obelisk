'use client';

/**
 * Thin wrapper around `@nostr-wot/blossom`. The SDK does the upload +
 * signing; obelisk just supplies the active NostrSigner from the caller.
 */

import { uploadToBlossom as sdkUpload, type BlossomBlob } from '@nostr-wot/blossom';
import type { NostrSigner } from '@nostr-wot/signers';

export async function uploadToBlossom(file: File, signer: NostrSigner): Promise<string> {
  const blob: BlossomBlob = await sdkUpload(file, { signer });
  return blob.url;
}

export type { BlossomBlob };
