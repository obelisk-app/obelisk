'use client';

import Text from '@/components/ui/layout/Text';
import Button from '@/components/ui/buttons/Button';
import Modal from '@/components/ui/overlays/Modal';
import { useTranslations } from 'next-intl';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import { useRelaySettingsModal } from '@/hooks/shell/modals/relay/useRelaySettingsModal';
import { HashIcon, ChevronRightIcon, UsersIcon, ImageIcon, SmileIcon, StarIcon } from '@/assets/icons';

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
    <Modal onClose={props.onClose} surface="card" panelClassName="w-full max-w-lg mx-4 flex flex-col overflow-hidden bg-lc-dark">
      <ModalHeader title={t('shell.desktop.server.settings')} subtitle={t('shell.desktop.server.settingsHelp')} onClose={props.onClose} />
      <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto px-5 py-4">
        {items.map(({ kind: icon, open }) => (
          <Button
            variant="bare"
            key={icon}
            onClick={open}
            className="flex items-center gap-4 rounded-lg border border-lc-border p-4 text-left hover:border-lc-green/50 hover:bg-lc-card"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-lc-green/10 text-lc-green" data-testid={`server-settings-icon-${icon}`}>
              {icon === 'profile' ? <ImageIcon size={21} />
                : icon === 'emoji' ? <SmileIcon size={21} />
                  : icon === 'channels' ? <HashIcon size={21} />
                    : icon === 'members' ? <UsersIcon size={21} />
                      : <StarIcon size={21} />}
            </span>
            <span className="min-w-0 flex-1">
              <Text size="sm" tone="default" weight="semibold" className="block">{t(`shell.desktop.server.items.${icon}.title`)}</Text>
              <Text variant="caption" className="mt-1 block">{t(`shell.desktop.server.items.${icon}.description`)}</Text>
            </span>
            <ChevronRightIcon strokeWidth={2} className="shrink-0 text-lc-muted" />
          </Button>
        ))}
      </div>
    </Modal>
  );
}
