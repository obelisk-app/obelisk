'use client';

import { useEffect } from 'react';
import { useBridge, useUserMetadata, type JsUserMetadata } from '@/services/nostr-bridge';
import { useMyPubkey, useSessionProfile } from '@/hooks/session/useSession';

/**
 * The kind 0 a message row draws its author from.
 *
 * The bridge's `useUserMetadata` delivers in an effect, so a row that has just
 * mounted paints once with no profile. For your own message (the optimistic
 * send above all) that frame showed your npub and a placeholder avatar before
 * your name and picture. The row also requests missing profiles for messages
 * that arrive outside the bridge ingest path. The session holds your profile and hands it
 * over synchronously, so your own rows start from it.
 */
export function useMessageAuthor(pubkey: string): JsUserMetadata | null {
  const bridge = useBridge();
  const meta = useUserMetadata(pubkey);
  useEffect(() => {
    if (pubkey && !meta) void bridge?.ensureUserMetadata?.(pubkey);
  }, [bridge, pubkey, meta]);
  const myPubkey = useMyPubkey();
  const ownProfile = useSessionProfile();
  return meta ?? (myPubkey && pubkey === myPubkey ? ownProfile : null);
}
