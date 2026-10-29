'use client';

import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/ui/media/UserAvatar';
import Text from '@/components/ui/layout/Text';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { useFormat } from '@/hooks/common/useFormat';
import { shortNpubLabel } from '@/utils/identity/short-npub';

/**
 * One person who came in on an invite link: picture, name, short npub and
 * the day. Someone the relay's operator later took out is marked removed.
 */
export default function RelayInviteJoinedPerson({ pubkey, at, removed }: { pubkey: string; at: number; removed: boolean }) {
  const t = useTranslations();
  const { formatDate } = useFormat();
  const author = useAuthor(pubkey);

  return (
    <li className={`flex items-center gap-2 min-w-0 ${removed ? 'opacity-60' : ''}`} data-testid="relay-invite-joined-person" data-removed={removed || undefined}>
      <UserAvatar pubkey={pubkey} picture={author.picture} name={author.name ?? undefined} size={6} />
      <div className="min-w-0">
        <Text as="span" size="xs" tone="default" className={`block truncate ${removed ? 'line-through' : ''}`}>{author.name ?? shortNpubLabel(pubkey)}</Text>
        {author.name && <Text as="span" size="xs" tone="muted" className="block truncate font-mono">{shortNpubLabel(pubkey)}</Text>}
      </div>
      <Text as="span" size="xs" tone={removed ? 'danger' : 'muted'} className="ml-auto shrink-0">
        {removed ? t('settings.invites.removed') : t('settings.invites.joinedOn', { date: formatDate(at * 1000) })}
      </Text>
    </li>
  );
}
