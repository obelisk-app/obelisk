'use client';

import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/ui/media/UserAvatar';
import Text from '@/components/ui/layout/Text';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { useFormat } from '@/hooks/common/useFormat';
import { shortNpubLabel } from '@/utils/identity/short-npub';

/** "Invited by <name>": who let this account into the relay, when it came in on someone's link. */
export default function RelayInviteInvitedBy({ pubkey, at }: { pubkey: string; at: number }) {
  const t = useTranslations();
  const { formatDate } = useFormat();
  const author = useAuthor(pubkey);
  return (
    <div className="flex items-center gap-2 min-w-0" data-testid="relay-invite-invited-by">
      <UserAvatar pubkey={pubkey} picture={author.picture} name={author.name ?? undefined} size={6} />
      <Text as="span" size="xs" tone="muted" className="truncate">
        {t('settings.invites.invitedBy', { name: author.name ?? shortNpubLabel(pubkey), date: formatDate(at * 1000) })}
      </Text>
    </div>
  );
}
