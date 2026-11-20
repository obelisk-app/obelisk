'use client';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { useConcordRoom } from '@/hooks/chat/concord/useConcordRoom';
import CopyButton from '@/components/ui/buttons/CopyButton';
import Button from '@/components/ui/buttons/Button';
import Input from '@/components/ui/forms/Input';
import FormError from '@/components/ui/forms/FormError';
import ConcordInviteList from './ConcordInviteList';
import ConcordBrandingForm from './ConcordBrandingForm';
import ConcordChannelEditForm from './ConcordChannelEditForm';
import ConcordChannelForm from './ConcordChannelForm';
import ConcordRoleForm from './ConcordRoleForm';
import ConcordMember from './ConcordMember';
import ConcordMemberChannelPolicy from './ConcordMemberChannelPolicy';

export interface ConcordSettingsProps { community: ConcordCommunity; vm: Omit<ReturnType<typeof useConcordRoom>, 'scroller'> }
export default function ConcordSettingsContent({ community, vm }: ConcordSettingsProps) {
  const t = useTranslations();
  return <div className="space-y-6 overflow-y-auto p-5">
        {vm.settings === 'invite' && <>
        {vm.canInvite && <Button variant="outline" data-testid="concord-create-invite" loading={vm.inviting} onClick={vm.createInvite}>{t('chat.concord.createInvite')}</Button>}
        {vm.invite && <div className="flex items-end gap-2"><Input readOnly label={t('chat.concord.invite')} value={vm.invite} data-testid="concord-invite-link" /><CopyButton size="md" text={vm.invite} label={t('shell.desktop.invite.copy')} copiedLabel={t('common.copied')} /></div>}
        <FormError>{vm.inviteError}</FormError>
        {vm.canInvite && <ConcordInviteList community={community} />}
        </>}
        {vm.settings === 'branding' && vm.canEditBranding && <ConcordBrandingForm community={community} branding={vm.branding} onSaved={vm.closeSettings} />}
        {vm.settings === 'edit-channel' && vm.canManageChannels && vm.channelId && <ConcordChannelEditForm key={vm.channelId} community={community} channelId={vm.channelId} name={vm.group?.name ?? ''} onSaved={vm.closeSettings} />}
        {vm.settings === 'channels' && vm.canManageChannels && <ConcordChannelForm community={community} />}
        {vm.settings === 'members' && <div data-testid="concord-member-list">
          {vm.members.length ? vm.members.map(pubkey => <ConcordMember key={pubkey} community={community} pubkey={pubkey} />) : <p>{t('mobile.members.empty')}</p>}
        </div>}
        {vm.settings === 'roles' && vm.canManageRoles && <>
          {community.pubkey === community.material.owner && <ConcordMemberChannelPolicy community={community} />}
          <ConcordRoleForm community={community} />
        </>}
      </div>;
}
