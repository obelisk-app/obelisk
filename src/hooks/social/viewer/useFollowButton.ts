'use client';

import { useState, type MouseEvent } from 'react';
import { useBridge, useMyContactList, useMyContactListReady } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { toggledFollowTags } from '@/services/social/profile-feed';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { KIND_CONTACT_LIST } from '@/constants/nostr/nip-kinds';
import type { MessageKey } from '@/i18n/keys';

/**
 * The note page's follow button (`src/components/social/viewer/FollowButton.tsx`):
 * whether there is anyone to follow as, whether `pubkey` is already
 * followed, and the click that republishes the contact list with them
 * added or removed.
 */
export function useFollowButton(pubkey: string) {
  const bridge = useBridge();
  const myPubkey = useMyPubkey();
  const contactEvent = useMyContactList();
  const ready = useMyContactListReady();
  const relays = usePreferences().socialRelays;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const following = !!contactEvent?.tags.some((tag) => tag[0] === 'p' && tag[1] === pubkey);

  const toggle = async () => {
    // Without the contact list loaded, publishing would replace it with a
    // one-entry list - i.e. silently unfollow everyone.
    if (!bridge || busy || !ready) return;
    setBusy(true);
    setFailed(false);
    try {
      await bridge.publishEvent({
        kind: KIND_CONTACT_LIST,
        content: contactEvent?.content ?? '',
        tags: toggledFollowTags(contactEvent?.tags ?? [], pubkey, !following),
        created_at: Math.max(Math.floor(Date.now() / 1000), (contactEvent?.created_at ?? 0) + 1),
      }, { extraRelays: relays, mode: 'replace' });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const labelKey: MessageKey = failed ? 'social.viewer.retry' : following ? 'social.viewer.following' : 'social.viewer.follow';

  return {
    /** Nobody to publish as, or it is your own key: no button at all. */
    hidden: !myPubkey || myPubkey === pubkey,
    following,
    busy,
    disabled: busy || !ready,
    labelKey,
    onClick: (event: MouseEvent) => {
      // The row is a link to the profile; the button is not.
      event.preventDefault();
      event.stopPropagation();
      void toggle();
    },
  };
}
