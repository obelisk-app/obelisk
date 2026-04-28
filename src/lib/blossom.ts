'use client';

/**
 * Thin wrapper around `@nostr-wot/blossom`. The SDK does the upload +
 * signing; obelisk just supplies the active NostrSigner from the hub.
 */

import { uploadToBlossom as sdkUpload, type BlossomBlob } from '@nostr-wot/blossom';
import { getNDK } from '@/lib/nostr';

export async function uploadToBlossom(file: File): Promise<string> {
  const ndk = getNDK();
  if (!ndk.signer) throw new Error('No signer available');
  const blob: BlossomBlob = await sdkUpload(file, { signer: ndk.signer });
  return blob.url;
}

export type { BlossomBlob };
