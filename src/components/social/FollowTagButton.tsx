'use client';

/**
 * Follow a hashtag: a NIP-51 interests entry, not a local bookmark.
 *
 * The write goes to kind 10015, so a tag followed here is followed in
 * Amethyst, Primal and Coracle too. See `services/social/interests.ts`.
 */

import { useState } from 'react';
import { useMyPubkey } from '@/services/nostr-bridge';
import { useInterests } from '@/hooks/social/useInterests';
import { useToastStore } from '@/store/toast';
import { useTranslation } from '@/i18n/context';
import Chip from '@/components/ui/Chip';

export default function FollowTagButton({
  tag,
  size = 'md',
}: {
  tag: string;
  /** `sm` for inside a list row, `md` for a page header. */
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  const myPubkey = useMyPubkey();
  const { isFollowing, toggle, ready } = useInterests();
  const [busy, setBusy] = useState(false);

  // Signing in is the prerequisite, and a button that only reports that on
  // click is worse than one that isn't there.
  if (!myPubkey) return null;

  const following = isFollowing(tag);

  const onClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    try {
      await toggle(tag);
    } catch {
      useToastStore.getState().pushToast({ title: t('social.actionFailed'), body: `#${tag}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Chip
      size={size === 'sm' ? '10' : 'xs'}
      state={following ? 'selected' : 'idle'}
      onClick={onClick}
      disabled={busy || !ready}
      // Hovering a followed tag previews the unfollow.
      className={`shrink-0 font-semibold ${following ? 'hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400' : ''}`}
      data-testid="follow-tag-button"
      data-following={following || undefined}
    >
      {following ? t('social.unfollowTag') : t('social.followTag')}
    </Chip>
  );
}
