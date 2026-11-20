'use client';
import { useTranslations } from 'next-intl';
import { ManageLayoutModal } from '../modals/layout/ManageLayoutModal';
import { ManageCategoriesSheet } from '../mobile/sheets/layout/ManageCategoriesSheet';
import ConcordCommunityMenu from './ConcordCommunityMenu';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import ConcordSettingsContent, { type ConcordSettingsProps } from './ConcordSettingsContent';

export default function ConcordSettings({ community, vm, mobile = false }: ConcordSettingsProps & { mobile?: boolean }) {
  const t = useTranslations();
  const title = vm.settings === 'members' ? t('mobile.members.members') : vm.settings === 'edit-channel' ? t('shell.desktop.channel.settings') : vm.settings === 'channels' ? t('chat.concord.createChannel') : vm.settings === 'roles' ? t('chat.concord.createRole') : t('chat.concord.settings');
  if (vm.settings === 'community') return <ConcordCommunityMenu community={community} vm={vm} mobile={mobile} />;
  if (vm.settings === 'layout') return mobile
    ? <ManageCategoriesSheet relayUrl={vm.branding.name} layout={vm.layout} channels={vm.rootChannels} close={vm.closeSettings} />
    : <ManageLayoutModal relayUrl={vm.branding.name} layout={vm.layout} channels={vm.rootChannels} onClose={vm.closeSettings} />;
  return mobile ? <Sheet onClose={vm.closeSettings} screen="channel-settings" label={title}>
    <SheetHeader title={title} onBack={vm.openSettings} />
    <ConcordSettingsContent community={community} vm={vm} />
  </Sheet> : <Modal onClose={vm.closeSettings} surface="card" panelClassName="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-lc-border bg-lc-dark">
    <ModalHeader title={title} onBack={vm.openSettings} onClose={vm.closeSettings} />
    <ConcordSettingsContent community={community} vm={vm} />
  </Modal>;
}
