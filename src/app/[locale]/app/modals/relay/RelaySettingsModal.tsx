'use client';

import Modal from '@/components/ui/overlays/Modal';
import { useTranslations } from 'next-intl';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import { useRelaySettingsModal } from '@/hooks/shell/modals/relay/useRelaySettingsModal';
import { RelaySettingsIcon } from './RelaySettingsIcon';

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
              <RelaySettingsIcon kind={icon} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-lc-white">{t(`shell.desktop.server.items.${icon}.title`)}</span>
              <span className="mt-1 block text-xs text-lc-muted">{t(`shell.desktop.server.items.${icon}.description`)}</span>
            </span>
            <svg className="shrink-0 text-lc-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        ))}
      </div>
    </Modal>
  );
}
