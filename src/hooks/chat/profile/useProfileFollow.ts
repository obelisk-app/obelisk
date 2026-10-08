'use client';

import { useState } from 'react';
import { useBridge, useMyContactList, useMyContactListReady } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { toggledFollowTags } from '@/services/social/profile-feed';

/**
 * Follow / unfollow `pubkey` by republishing the reader's kind 3 with the
 * `p` tag toggled. `contactsReady` stays false until the reader's own list
 * has loaded, so a click can never publish an empty list over a real one.
 */
export function useProfileFollow(pubkey: string, relays: readonly string[]) {
  const bridge = useBridge();
  const myPubkey = useMyPubkey();
  const contactEvent = useMyContactList();
  const contactsReady = useMyContactListReady() || !myPubkey;
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState(false);

  const isMe = myPubkey === pubkey;
  const following = !!contactEvent?.tags.some((tag) => tag[0] === 'p' && tag[1] === pubkey);

  const toggleFollow = async () => {
    if (!bridge || !myPubkey || !contactsReady || followBusy) return;
    setFollowBusy(true);
    setFollowError(false);
    try {
      await bridge.publishEvent({
        kind: 3,
        content: contactEvent?.content ?? '',
        tags: toggledFollowTags(contactEvent?.tags ?? [], pubkey, !following),
        created_at: Math.max(Math.floor(Date.now() / 1000), (contactEvent?.created_at ?? 0) + 1),
      }, { extraRelays: relays, mode: 'replace' });
    } catch {
      setFollowError(true);
    } finally {
      setFollowBusy(false);
    }
  };

  return { isMe, following, contactsReady, followBusy, followError, toggleFollow };
}
