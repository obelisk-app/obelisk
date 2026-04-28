'use client';

/**
 * Mirrors obelisk's NDK-based auth state into `@nostr-wot/data`'s session
 * context so SDK hooks (`useSigner`, `useDMSession`, blossom uploads,
 * zaps, …) can read the active signer from React context instead of
 * reaching into `getNDK().signer`.
 *
 * Obelisk keeps its own auth store + LoginModal + backend session; this
 * is the one-way bridge that surfaces the result to anyone consuming
 * the new SDK provider.
 */

import { useEffect } from 'react';
import { useSession, type SessionSigner } from '@nostr-wot/data/react';
import {
  ndkSignerAsNostrSigner,
  type NdkEventCtor,
  type NdkLike,
  type NdkSignerLike,
} from '@nostr-wot/signers';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getNDK, onSignerChange } from '@/lib/nostr';

export function SdkSessionBridge() {
  const { setSigner } = useSession();

  useEffect(() => {
    const ndk = getNDK();
    const sync = (s: typeof ndk.signer) => {
      if (!s) {
        void setSigner(null);
        return;
      }
      try {
        const wrapped = ndkSignerAsNostrSigner({
          ndk: ndk as unknown as NdkLike,
          NDKEvent: NDKEvent as unknown as NdkEventCtor,
          signer: s as unknown as NdkSignerLike,
        });
        void setSigner(wrapped as unknown as SessionSigner);
      } catch (err) {
        console.warn('[SdkSessionBridge] failed to wrap NDK signer:', err);
        void setSigner(null);
      }
    };

    // Initial pass — pick up any signer that's already attached
    sync(ndk.signer);
    return onSignerChange(sync);
  }, [setSigner]);

  return null;
}
