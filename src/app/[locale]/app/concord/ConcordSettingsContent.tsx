'use client';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { useConcordRoom } from '@/hooks/chat/concord/useConcordRoom';
import CopyButton from '@/components/ui/buttons/CopyButton';
import Button from '@/components/ui/buttons/Button';
import Input from '@/components/ui/forms/Input';
import FormError from '@/components/ui/forms/FormError';
import ConcordBrandingForm from './ConcordBrandingForm';
import ConcordChannelEditForm from './ConcordChannelEditForm';
import ConcordChannelForm from './ConcordChannelForm';
import ConcordRoleForm from './ConcordRoleForm';

export interface ConcordSettingsProps { community: ConcordCommunity; vm: Omit<ReturnType<typeof useConcordRoom>, 'scroller'> }
export default function ConcordSettingsContent({ community, vm }: ConcordSettingsProps) {
  const t = useTranslations();
  return <div className="space-y-6 overflow-y-auto p-5">
        {vm.settings === 'community' && <>
        {vm.canInvite && <Button variant="outline" data-testid="concord-create-invite" onClick={vm.createInvite}>{t('chat.concord.invite')}</Button>}
        {vm.invite && <div className="flex items-end gap-2"><Input readOnly label={t('chat.concord.invite')} value={vm.invite} data-testid="concord-invite-link" /><CopyButton size="md" text={vm.invite} label={t('shell.desktop.invite.copy')} copiedLabel={t('common.copied')} /></div>}
        <FormError>{vm.error}</FormError>
        {vm.canEditBranding && <ConcordBrandingForm community={community} branding={vm.branding} onSaved={vm.closeSettings} />}
        <div className="flex flex-wrap gap-2 border-t border-lc-border pt-4">
          {vm.canManageChannels && <Button variant="outline" data-testid="concord-channel-settings" onClick={vm.openChannelSettings}>{t('chat.concord.createChannel')}</Button>}
          {vm.canManageRoles && <Button variant="outline" data-testid="concord-role-settings" onClick={vm.openRoleSettings}>{t('chat.concord.createRole')}</Button>}
        </div>
        </>}
        {vm.settings === 'edit-channel' && vm.canManageChannels && vm.channelId && <ConcordChannelEditForm key={vm.channelId} community={community} channelId={vm.channelId} name={vm.group?.name ?? ''} onSaved={vm.closeSettings} />}
        {vm.settings === 'channels' && vm.canManageChannels && <ConcordChannelForm community={community} />}
        {vm.settings === 'roles' && vm.canManageRoles && <ConcordRoleForm community={community} />}
      </div>;
}
