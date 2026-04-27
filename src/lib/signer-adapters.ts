// src/lib/signer-adapters.ts
// Single home for adapters that wrap an NDK signer in the smaller
// interfaces individual consumers care about. Centralising here:
//   - removes duplicated inline adapters (e.g. zap-request signing was
//     copy-pasted in MessageInput + ZapPickerModal),
//   - replaces ad-hoc `as KEKSigner` casts that hid real type errors
//     (WalletPanel was passing a KEKSigner where a Nip98Signer was
//     expected — silently broken at runtime),
//   - gives every consumer one place to look when wiring a new flow.

import type NDK from '@nostr-dev-kit/ndk';
import { type NDKSigner, NDKUser, NDKEvent } from '@nostr-dev-kit/ndk';
import type { KEKSigner } from '@/lib/dm/cache-key';
import type { Nip98Signer, Nip98EventTemplate, Nip98SignedEvent } from '@/lib/nip98';
import type { ZapRequestSigner, ZapRequestTemplate, ZapRequestSignedEvent } from '@/lib/wallet/zap-request';

interface MaybeNip44Methods {
  nip44Encrypt?: (recipientPubkey: string, plaintext: string) => Promise<string>;
  nip44Decrypt?: (senderPubkey: string, ciphertext: string) => Promise<string>;
}

/**
 * NDK signer → KEKSigner. Used by the DM cache key + the wallet
 * local-store. Browser extensions that already expose nip44Encrypt/Decrypt
 * directly bypass NDK's encrypt() wrapper.
 */
export function toKEKSigner(
  ndk: NDK,
  ndkSigner: NDKSigner | null | undefined,
  pubkey: string,
): KEKSigner | null {
  if (!ndkSigner) return null;
  const direct = ndkSigner as unknown as MaybeNip44Methods;
  const hasDirect =
    typeof direct.nip44Encrypt === 'function' &&
    typeof direct.nip44Decrypt === 'function';

  return {
    pubkey,
    nip44Encrypt: async (recipientPubkey, plaintext) => {
      if (hasDirect) return direct.nip44Encrypt!(recipientPubkey, plaintext);
      const user = new NDKUser({ pubkey: recipientPubkey });
      user.ndk = ndk;
      return ndkSigner.encrypt(user, plaintext, 'nip44');
    },
    nip44Decrypt: async (senderPubkey, ciphertext) => {
      if (hasDirect) return direct.nip44Decrypt!(senderPubkey, ciphertext);
      const user = new NDKUser({ pubkey: senderPubkey });
      user.ndk = ndk;
      return ndkSigner.decrypt(user, ciphertext, 'nip44');
    },
  };
}

/**
 * NDK signer → Nip98Signer. Used by the wallet provisioning flow against
 * zaps.nostr-wot.com (NIP-98 kind 27235 HTTP auth). Wraps NDK's signEvent
 * because the underlying signer expects an NDKEvent, not a raw template.
 */
export function toNip98Signer(
  ndk: NDK,
  ndkSigner: NDKSigner | null | undefined,
): Nip98Signer | null {
  if (!ndkSigner) return null;
  return {
    getPublicKey: async () => {
      const user = await ndkSigner.user();
      return user.pubkey;
    },
    signEvent: async (template: Nip98EventTemplate): Promise<Nip98SignedEvent> => {
      const e = new NDKEvent(ndk, {
        kind: template.kind,
        created_at: template.created_at,
        tags: template.tags,
        content: template.content,
      } as never);
      await e.sign(ndkSigner);
      return {
        ...template,
        pubkey: e.pubkey,
        id: e.id!,
        sig: e.sig!,
      };
    },
  };
}

/**
 * NDK signer → ZapRequestSigner (NIP-57 kind 9734). Same shape as the
 * Nip98 adapter — the difference is only the kind being signed; we keep
 * them as separate functions so callers' types stay narrow and a future
 * change (e.g. adding a "this looks like a zap request" precondition)
 * lands in one place.
 */
export function toZapRequestSigner(
  ndk: NDK,
  ndkSigner: NDKSigner | null | undefined,
): ZapRequestSigner | null {
  if (!ndkSigner) return null;
  return {
    signEvent: async (template: ZapRequestTemplate): Promise<ZapRequestSignedEvent> => {
      const e = new NDKEvent(ndk, {
        kind: template.kind,
        created_at: template.created_at,
        tags: template.tags,
        content: template.content,
      } as never);
      await e.sign(ndkSigner);
      return {
        ...template,
        pubkey: e.pubkey,
        id: e.id!,
        sig: e.sig!,
      };
    },
  };
}
