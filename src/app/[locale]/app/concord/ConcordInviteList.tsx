'use client';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordInvites } from '@/hooks/chat/concord/useConcordInvites';
import Text from '@/components/ui/layout/Text';
import ConcordInviteRow from './ConcordInviteRow';

export default function ConcordInviteList({ community, canShare, sharedInvite }: { community: ConcordCommunity; canShare: boolean; sharedInvite: string | null }) {
  const t = useTranslations();
  const vm = useConcordInvites(community.communityId);
  return <div className="space-y-4">
    <Text as="p" size="sm" tone="muted">{t('chat.concord.inviteListHint')}</Text>
    {vm.invites.map(invite => <ConcordInviteRow key={invite.signerPubkey} community={community} invite={invite} canShare={canShare} shared={invite.url === sharedInvite} />)}
  </div>;
}
