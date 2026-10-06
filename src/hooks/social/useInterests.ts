'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useMyPubkey } from '@/services/nostr-bridge';
import {
  ensureInterests,
  getInterestsSnapshot,
  subscribeInterests,
  toggleFollowedInterest,
} from '@/services/social/interests-store';

/**
 * The signed-in account's followed hashtags, from the one shared store in
 * `src/services/social/interests-store.ts`: every follow button reads the
 * same optimistic list.
 */
export interface InterestsApi {
  /** null while loading. */
  tags: string[] | null;
  isFollowing: (tag: string) => boolean;
  toggle: (tag: string) => Promise<void>;
  ready: boolean;
}

export function useInterests(): InterestsApi {
  const myPubkey = useMyPubkey();
  const current = useSyncExternalStore(subscribeInterests, getInterestsSnapshot, getInterestsSnapshot);

  ensureInterests(myPubkey ?? null);

  const tags = current.pubkey === (myPubkey ?? null) ? current.tags : null;

  const isFollowing = useCallback(
    (tag: string) => (tags ?? []).includes(tag.trim().replace(/^#+/, '').toLowerCase()),
    [tags],
  );

  const toggle = useCallback(async (tag: string) => {
    if (!myPubkey) return;
    await toggleFollowedInterest(tag);
  }, [myPubkey]);

  return { tags, isFollowing, toggle, ready: tags !== null };
}
