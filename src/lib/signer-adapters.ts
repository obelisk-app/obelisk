// src/lib/signer-adapters.ts
// Adapters that wrap a `@nostr-wot/signers` `NostrSigner` in the smaller
// interfaces individual consumers care about. Centralising here:
//   - removes duplicated inline adapters (e.g. zap-request signing was
//     copy-pasted in MessageInput + ZapPickerModal),
//   - keeps each consumer's type narrow (KEKSigner vs Nip98Signer vs
//     ZapRequestSigner) so accidental misuse surfaces at compile time.
//
// All three adapters delegate directly to the underlying NostrSigner —
// the SDK signer already returns finalized `nostr-tools` events from
// `signEvent`, so the wrappers are essentially just type narrowing
// today. They remain as functions (rather than passing the raw signer
// through) so we have a single hook for any future precondition or
// telemetry layer.

import type { NostrSigner } from '@nostr-wot/signers';
import type { KEKSigner } from '@/lib/dm/cache-key';
import type { Nip98Signer, Nip98EventTemplate, Nip98SignedEvent } from '@/lib/nip98';
import type { ZapRequestSigner, ZapRequestTemplate, ZapRequestSignedEvent } from '@/lib/wallet/zap-request';

/**
 * NostrSigner → KEKSigner. Used by the DM cache key + the wallet
 * local-store. NIP-44 is required; signers without nip44Encrypt/Decrypt
 * (e.g. NIP-46 bunkers that haven't negotiated NIP-44 perms) cannot be
 * adapted — caller should detect and error out before reaching the
 * wallet/DM flows.
 */
export function toKEKSigner(
  _ndkUnused: unknown,
  signer: NostrSigner | null | undefined,
  pubkey: string,
): KEKSigner | null {
  if (!signer) return null;
  if (typeof signer.nip44Encrypt !== 'function' || typeof signer.nip44Decrypt !== 'function') {
    return null;
  }
  return {
    pubkey,
    nip44Encrypt: (recipientPubkey, plaintext) => signer.nip44Encrypt!(recipientPubkey, plaintext),
    nip44Decrypt: (senderPubkey, ciphertext) => signer.nip44Decrypt!(senderPubkey, ciphertext),
  };
}

/**
 * NostrSigner → Nip98Signer. Used by the wallet provisioning flow against
 * zaps.nostr-wot.com (NIP-98 kind 27235 HTTP auth).
 */
export function toNip98Signer(
  _ndkUnused: unknown,
  signer: NostrSigner | null | undefined,
): Nip98Signer | null {
  if (!signer) return null;
  return {
    getPublicKey: () => signer.getPublicKey(),
    signEvent: async (template: Nip98EventTemplate): Promise<Nip98SignedEvent> => {
      const event = await signer.signEvent(template);
      return {
        ...template,
        pubkey: event.pubkey,
        id: event.id,
        sig: event.sig,
      };
    },
  };
}

/**
 * NostrSigner → ZapRequestSigner (NIP-57 kind 9734). Same shape as the
 * Nip98 adapter — the difference is only the kind being signed; we keep
 * them as separate functions so callers' types stay narrow and a future
 * change (e.g. adding a "this looks like a zap request" precondition)
 * lands in one place.
 */
export function toZapRequestSigner(
  _ndkUnused: unknown,
  signer: NostrSigner | null | undefined,
): ZapRequestSigner | null {
  if (!signer) return null;
  return {
    signEvent: async (template: ZapRequestTemplate): Promise<ZapRequestSignedEvent> => {
      const event = await signer.signEvent(template);
      return {
        ...template,
        pubkey: event.pubkey,
        id: event.id,
        sig: event.sig,
      };
    },
  };
}
