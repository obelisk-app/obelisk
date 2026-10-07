'use client';

/**
 * Follow a hashtag: a NIP-51 interests entry, not a local bookmark.
 *
 * The write goes to kind 10015, so a tag followed here is followed in
 * Amethyst, Primal and Coracle too. See `services/social/interests.ts`.
 */

import { useTranslations } from 'next-intl';
import { useFollowTagButton } from '@/hooks/social/tags/useFollowTagButton';
import Chip from '@/components/ui/data/Chip';

export default function FollowTagButton({
  tag,
  size = 'md',
}: {
  tag: string;
  /** `sm` for inside a list row, `md` for a page header. */
  size?: 'sm' | 'md';
}) {
  const t = useTranslations();
  const { visible, following, disabled, onClick } = useFollowTagButton(tag);

  if (!visible) return null;

  return (
    <Chip
      size={size === 'sm' ? '10' : 'xs'}
      state={following ? 'selected' : 'idle'}
      onClick={onClick}
      disabled={disabled}
      // Hovering a followed tag previews the unfollow.
      className={`shrink-0 font-semibold ${following ? 'hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400' : ''}`}
      data-testid="follow-tag-button"
      data-following={following || undefined}
    >
      {following ? t('social.unfollowTag') : t('social.followTag')}
    </Chip>
  );
}
