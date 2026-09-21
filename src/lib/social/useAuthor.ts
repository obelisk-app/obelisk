'use client';

/**
 * The display identity for a feed author.
 *
 * Two sources, deliberately layered rather than one replacing the other:
 *
 *  - The **bridge** (`useUserMetadata`) already holds kind 0 for anyone in
 *    your NIP-29 rooms, warm and free. If it has them, use it.
 *  - The **social resolver** covers everyone else — which on the open network
 *    is most people, including direct follows, because the bridge only looks
 *    at the group/profile-lookup relay tier.
 *
 * Merged field-by-field rather than picking a winner: the bridge may know a
 * name while the social relays have a newer picture, and a half-populated
 * record from either side shouldn't blank out what the other knows.
 */

import { useEffect } from 'react';
import { nostrActions, useUserMetadata } from '@/lib/nostr-bridge';
import { useSocialProfile } from './profiles';

export type AuthorIdentity = {
  displayName: string | null;
  name: string | null;
  picture: string | null;
  nip05: string | null;
  about: string | null;
  banner: string | null;
  lud16: string | null;
};

export function useAuthor(pubkey: string | null | undefined): AuthorIdentity {
  const bridge = useUserMetadata(pubkey ?? '');
  const social = useSocialProfile(pubkey ?? null);

  useEffect(() => {
    if (!pubkey) return;
    // Warm the bridge too — it's the one that group surfaces read.
    // `Promise.resolve` because this is a fire-and-forget warm: the call is
    // allowed to be synchronous or absent, and a display name is not worth
    // throwing over.
    void Promise.resolve(nostrActions.ensureUserMetadata?.(pubkey)).catch(() => {});
  }, [pubkey]);

  const pick = (key: keyof AuthorIdentity): string | null => (
    (bridge as Partial<AuthorIdentity> | null)?.[key] || social?.[key] || null
  );

  return {
    displayName: pick('displayName'),
    name: pick('name'),
    picture: pick('picture'),
    nip05: pick('nip05'),
    about: pick('about'),
    banner: pick('banner'),
    lud16: pick('lud16'),
  };
}
