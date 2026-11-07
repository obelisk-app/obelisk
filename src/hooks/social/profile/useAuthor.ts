'use client';

/**
 * The display identity for a feed author.
 *
 * The newest timestamped kind 0 is authoritative across bridge and social
 * sources, including intentionally removed fields. Legacy cache entries
 * without a timestamp remain field-by-field display fallbacks.
 */

import { useEffect } from 'react';
import { nostrActions, useUserMetadata } from '@/services/nostr-bridge';
import { useSocialProfile } from './useSocialProfile';

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
    // Warm the bridge too: it's the one that group surfaces read.
    // `Promise.resolve` because this is a fire-and-forget warm: the call is
    // allowed to be synchronous or absent, and a display name is not worth
    // throwing over.
    void Promise.resolve(nostrActions.ensureUserMetadata?.(pubkey)).catch(() => {});
  }, [pubkey]);

  const latest = (social?.createdAt ?? 0) > (bridge?.createdAt ?? 0) ? social : bridge;
  const fallback = latest === social ? bridge : social;
  const pick = (key: keyof AuthorIdentity): string | null => latest?.createdAt
    ? latest[key] ?? null : latest?.[key] || fallback?.[key] || null;

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
