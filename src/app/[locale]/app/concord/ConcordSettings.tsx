'use client';
import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import ConcordSettingsContent, { type ConcordSettingsProps } from './ConcordSettingsContent';

export default function ConcordSettings({ community, vm, mobile = false }: ConcordSettingsProps & { mobile?: boolean }) {
  const t = useTranslations();
  const title = vm.settings === 'edit-channel' ? t('shell.desktop.channel.settings') : vm.settings === 'channels' ? t('chat.concord.createChannel') : vm.settings === 'roles' ? t('chat.concord.createRole') : t('chat.concord.settings');
  return mobile ? <Sheet onClose={vm.closeSettings} screen="channel-settings" label={title}>
    <SheetHeader title={title} onBack={vm.settings === 'community' ? vm.closeSettings : vm.openSettings} />
    <ConcordSettingsContent community={community} vm={vm} />
  </Sheet> : <Modal onClose={vm.closeSettings} surface="card" panelClassName="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-lc-border bg-lc-dark">
    <ModalHeader title={title} onBack={vm.settings === 'community' ? undefined : vm.openSettings} onClose={vm.closeSettings} />
    <ConcordSettingsContent community={community} vm={vm} />
  </Modal>;
}
