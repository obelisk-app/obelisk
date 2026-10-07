'use client';

import Modal from '@/components/ui/overlays/Modal';
import { useTranslations } from 'next-intl';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import { useRelaySettingsModal } from '@/hooks/shell/modals/relay/useRelaySettingsModal';
import { ChannelsIcon, ChevronRightIcon, MembersIcon, ProfileCardIcon, SmileIcon, StarSimpleIcon } from '@/assets/icons';

export function RelaySettingsModal(props: {
  onClose: () => void;
  onBranding: () => void;
  onEmojis: () => void;
  onLayout: () => void;
  onMembers: () => void;
  onRoles: () => void;
}) {
  const t = useTranslations();
  const { items } = useRelaySettingsModal(props);

  return (
    <Modal onClose={props.onClose} panelClassName="lc-card w-full max-w-lg mx-4 flex flex-col overflow-hidden bg-lc-dark">
      <ModalHeader title={t('shell.desktop.server.settings')} subtitle={t('shell.desktop.server.settingsHelp')} onClose={props.onClose} />
      <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto px-5 py-4">
        {items.map(({ kind: icon, open }) => (
          <button
            key={icon}
            onClick={open}
            className="flex items-center gap-4 rounded-lg border border-lc-border p-4 text-left hover:border-lc-green/50 hover:bg-lc-card"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-lc-green/10 text-lc-green" data-testid={`server-settings-icon-${icon}`}>
              {icon === 'profile' ? <ProfileCardIcon size={21} />
                : icon === 'emoji' ? <SmileIcon size={21} />
                  : icon === 'channels' ? <ChannelsIcon size={21} />
                    : icon === 'members' ? <MembersIcon size={21} />
                      : <StarSimpleIcon size={21} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-lc-white">{t(`shell.desktop.server.items.${icon}.title`)}</span>
              <span className="mt-1 block text-xs text-lc-muted">{t(`shell.desktop.server.items.${icon}.description`)}</span>
            </span>
            <ChevronRightIcon strokeWidth={2} className="shrink-0 text-lc-muted" strokeLinecap="butt" strokeLinejoin="miter" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
