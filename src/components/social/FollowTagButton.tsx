'use client';

/**
 * Follow a hashtag — a NIP-51 interests entry, not a local bookmark.
 *
 * The write goes to kind 10015, so a tag followed here is followed in
 * Amethyst, Primal and Coracle too. See `lib/social/interests.ts`.
 */

import { useState } from 'react';
import { useMyPubkey } from '@/lib/nostr-bridge';
import { useInterests } from '@/lib/social/useInterests';
import { useToastStore } from '@/store/toast';
import { useTranslation } from '@/i18n/context';

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
    <button
      type="button"
      onClick={onClick}
      disabled={busy || !ready}
      aria-pressed={following}
      className={`shrink-0 rounded-full border font-semibold transition-colors disabled:opacity-50 ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      } ${
        following
          ? 'border-lc-green/40 bg-lc-green/10 text-lc-green hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400'
          : 'border-lc-border text-lc-muted hover:border-lc-green/50 hover:text-lc-white'
      }`}
      data-testid="follow-tag-button"
      data-following={following || undefined}
    >
      {following ? t('social.unfollowTag') : t('social.followTag')}
    </button>
  );
}
