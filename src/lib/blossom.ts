'use client';

/**
 * Thin wrapper around `@nostr-wot/blossom`. The SDK does the upload +
 * signing; obelisk just adapts the active NDK signer to the SDK's
 * NostrSigner interface.
 */

import { uploadToBlossom as sdkUpload, type BlossomBlob } from '@nostr-wot/blossom';
import type { NostrSigner } from '@nostr-wot/signers';
import type { EventTemplate, Event as NostrEvent } from 'nostr-tools';
import { NDKEvent, type NDKSigner } from '@nostr-dev-kit/ndk';
import { getNDK } from '@/lib/nostr';

function ndkSignerAsNostrSigner(ndkSigner: NDKSigner): NostrSigner {
  return {
    async getPublicKey() {
      const user = await ndkSigner.user();
      return user.pubkey;
    },
    async signEvent(template: EventTemplate): Promise<NostrEvent> {
      const ndk = getNDK();
      const ev = new NDKEvent(ndk);
      ev.kind = template.kind;
      ev.content = template.content;
      ev.tags = template.tags;
      ev.created_at = template.created_at;
      await ev.sign(ndkSigner);
      return ev.rawEvent() as NostrEvent;
    },
  };
}

export async function uploadToBlossom(file: File): Promise<string> {
  const ndk = getNDK();
  if (!ndk.signer) throw new Error('No signer available');
  const signer = ndkSignerAsNostrSigner(ndk.signer);
  const blob: BlossomBlob = await sdkUpload(file, { signer });
  return blob.url;
}

export type { BlossomBlob };
