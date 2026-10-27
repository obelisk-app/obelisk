'use client';

import { useLocale, useTranslations } from 'next-intl';
import UserAvatar from '@/components/ui/media/UserAvatar';
import Text from '@/components/ui/layout/Text';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { relativeTime } from '@/utils/format/relative-time';

/** One person who came in on an invite link: their picture, their name (a short npub until the profile loads) and when. */
export default function RelayInviteJoinedPerson({ pubkey, at }: { pubkey: string; at: number }) {
  const t = useTranslations();
  const locale = useLocale();
  const author = useAuthor(pubkey);

  return (
    <li className="flex items-center gap-2 min-w-0" data-testid="relay-invite-joined-person">
      <UserAvatar pubkey={pubkey} picture={author.picture} name={author.name ?? undefined} size={6} />
      <Text as="span" size="xs" tone="default" className="truncate">{author.name ?? shortNpubLabel(pubkey)}</Text>
      <Text as="span" size="xs" tone="muted" className="ml-auto shrink-0">{t('settings.invites.joinedAgo', { time: relativeTime(at, t, locale) })}</Text>
    </li>
  );
}
