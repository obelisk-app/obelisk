import { sealAndGiftWrapForSelf, unwrapGiftWrapForSelf, type GiftWrapRumor, type SelfGiftWrapTemplate } from '@nostr-wot/dm';
import type { NostrSigner } from '@nostr-wot/signers';
import type { Event as NostrEvent } from 'nostr-tools';
import type { NipSigner } from '@/types/nostr/nip-signer';

/** Adapt the bridge's captured session key to the SDK's async signer interface. */
function sdkSigner(signer: NipSigner): NostrSigner {
  return {
    getPublicKey: async () => signer.pubkey,
    signEvent: (template) => signer.signEvent(template),
    nip44Encrypt: (pubkey, plaintext) => signer.nip44Encrypt(pubkey, plaintext),
    nip44Decrypt: (pubkey, ciphertext) => signer.nip44Decrypt(pubkey, ciphertext),
  };
}

/** Read-state transport adapter; encryption and envelope validation belong to the SDK. */
export function wrapForSelf(template: SelfGiftWrapTemplate, signer: NipSigner): Promise<NostrEvent> {
  return sealAndGiftWrapForSelf(sdkSigner(signer), template);
}

export function unwrapForSelf(wrap: NostrEvent, signer: NipSigner): Promise<GiftWrapRumor | null> {
  return unwrapGiftWrapForSelf(sdkSigner(signer), wrap);
}
