'use client';
import { useTranslations } from 'next-intl';
import { RelaySettingsModal } from '../modals/relay/RelaySettingsModal';
import { RelayMenuRow } from '../mobile/sheets/relay/RelayMenuRow';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import { HashIcon, ImageIcon, StarIcon, UsersIcon, UserPlusIcon } from '@/assets/icons';
import type { ConcordSettingsProps } from './ConcordSettingsContent';

/** Native server menu, exposing only actions supported by this community and role. */
export default function ConcordCommunityMenu({ vm, mobile }: ConcordSettingsProps & { mobile: boolean }) {
  const t = useTranslations();
  return mobile ? <Sheet onClose={vm.closeSettings} screen="relay-menu" label={vm.branding.name} maxHeight="88%">
    <SheetHeader title={vm.branding.name} onBack={vm.closeSettings} />
    {vm.canInvite && <RelayMenuRow icon={<UserPlusIcon size={20} />} rowLabel={t('chat.concord.invite')} onClick={vm.openInvite} />}
    {vm.canEditBranding && <RelayMenuRow icon={<ImageIcon size={20} />} rowLabel={t('mobile.branding.edit')} onClick={vm.openBranding} />}
    {vm.canManageLayout && <RelayMenuRow icon={<HashIcon size={20} />} rowLabel={t('mobile.layout.title')} onClick={vm.openLayout} />}
    {vm.canManageChannels && <RelayMenuRow icon={<HashIcon size={20} />} rowLabel={t('chat.concord.createChannel')} onClick={vm.openChannelSettings} />}
    {vm.canManageRoles && <RelayMenuRow icon={<StarIcon size={20} />} rowLabel={t('mobile.space.roles')} onClick={vm.openRoleSettings} />}
    <RelayMenuRow icon={<UsersIcon size={20} />} rowLabel={t('mobile.members.members')} onClick={vm.openMemberSettings} />
  </Sheet> : <RelaySettingsModal onClose={vm.closeSettings}
    onBranding={vm.canEditBranding ? vm.openBranding : undefined}
    onLayout={vm.canManageLayout ? vm.openLayout : undefined}
    onRoles={vm.canManageRoles ? vm.openRoleSettings : undefined}
    onCreateChannel={vm.canManageChannels ? vm.openChannelSettings : undefined}
    onInvite={vm.canInvite ? vm.openInvite : undefined}
    onMembers={vm.openMemberSettings} memberDirectory />;
}
