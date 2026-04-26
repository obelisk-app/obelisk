// src/lib/ndk-kek-signer.ts
// Adapter from an NDK signer to the KEKSigner interface used by the DM
// cache key + wallet local-store. NDK exposes
// `encrypt(NDKUser, value, 'nip44')`; we expose `nip44Encrypt(pubkey, pt)`.
// Also handles signers (browser extensions) that already expose
// nip44Encrypt/Decrypt directly — those bypass the NDK call entirely.

import type NDK from '@nostr-dev-kit/ndk';
import type { NDKSigner } from '@nostr-dev-kit/ndk';
import { NDKUser } from '@nostr-dev-kit/ndk';
import type { KEKSigner } from '@/lib/dm/cache-key';

interface MaybeNip44Methods {
  nip44Encrypt?: (recipientPubkey: string, plaintext: string) => Promise<string>;
  nip44Decrypt?: (senderPubkey: string, ciphertext: string) => Promise<string>;
}

export function toKEKSigner(ndk: NDK, ndkSigner: NDKSigner | null | undefined, pubkey: string): KEKSigner | null {
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
