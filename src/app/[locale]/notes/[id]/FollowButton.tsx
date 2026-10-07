'use client';

/**
 * Follow someone from the note page.
 *
 * The author-context lists were read-only: "here are ten people this author
 * reads" with no way to act on it, so the most useful thing on the page -
 * discovery - ended at a link. This is a client island inside the
 * server-rendered context, because following needs a signer and the rest of
 * that page is static HTML a crawler can read.
 *
 * Renders nothing when there's nobody to publish as, rather than a button
 * that asks you to log in from a page that has no login: the link to the
 * profile is already there, and Obelisk's own surfaces do have one.
 */

import { useState } from 'react';
import {
  useBridge,
  useMyContactList,
  useMyContactListReady,
  useMyPubkey,
} from '@/services/nostr-bridge';
import { toggledFollowTags } from '@/services/social/profile-feed';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { useTranslations } from 'next-intl';

export default function FollowButton({
  pubkey,
  className = '',
}: {
  pubkey: string;
  className?: string;
}) {
  const t = useTranslations();
  const bridge = useBridge();
  const myPubkey = useMyPubkey();
  const contactEvent = useMyContactList();
  const ready = useMyContactListReady();
  const relays = usePreferences().socialRelays;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const following = !!contactEvent?.tags.some((tag) => tag[0] === 'p' && tag[1] === pubkey);

  if (!myPubkey || myPubkey === pubkey) return null;

  const toggle = async () => {
    // Without the contact list loaded, publishing would replace it with a
    // one-entry list - i.e. silently unfollow everyone.
    if (!bridge || busy || !ready) return;
    setBusy(true);
    setFailed(false);
    try {
      await bridge.publishEvent({
        kind: 3,
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

  return (
    <button
      type="button"
      onClick={(event) => {
        // The row is a link to the profile; the button is not.
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
      disabled={busy || !ready}
      aria-pressed={following}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
        following
          ? 'border-lc-border text-lc-muted hover:text-lc-white'
          : 'border-lc-green/50 bg-lc-green/15 text-lc-green hover:bg-lc-green/25'
      } ${className}`}
      data-testid="follow-button"
    >
      {busy ? '…' : t(failed ? 'social.viewer.retry' : following ? 'social.viewer.following' : 'social.viewer.follow')}
    </button>
  );
}
