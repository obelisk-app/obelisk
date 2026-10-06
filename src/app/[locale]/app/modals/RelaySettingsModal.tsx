'use client';

import Modal from '@/components/ui/Modal';
import { useTranslations } from 'next-intl';
import CloseButton from '@/components/ui/CloseButton';

export function RelaySettingsModal({
  onClose,
  onBranding,
  onEmojis,
  onLayout,
  onMembers,
  onRoles,
}: {
  onClose: () => void;
  onBranding: () => void;
  onEmojis: () => void;
  onLayout: () => void;
  onMembers: () => void;
  onRoles: () => void;
}) {
  const t = useTranslations();
  const items = [
    ['profile', onBranding],
    ['emoji', onEmojis],
    ['channels', onLayout],
    ['roles', onRoles],
    ['members', onMembers],
  ] as const;

  return (
    <Modal onClose={onClose} panelClassName="lc-card w-full max-w-lg mx-4 overflow-hidden bg-lc-dark">
      <header className="flex items-start justify-between border-b border-lc-border px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-lc-white">{t('shell.desktop.server.settings')}</h2>
          <p className="mt-1 text-xs text-lc-muted">{t('shell.desktop.server.settingsHelp')}</p>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      <div className="grid gap-2 p-4">
        {items.map(([icon, action]) => (
          <button
            key={icon}
            onClick={() => { onClose(); action(); }}
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

function RelaySettingsIcon({ kind }: { kind: 'profile' | 'emoji' | 'channels' | 'members' | 'roles' }) {
  const paths = {
    profile: <><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0M4 4h16v16H4z"/></>,
    emoji: <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></>,
    channels: <><path d="M5 4v16M19 4v16M4 8h16M4 16h16"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/></>,
    members: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3 20a6 6 0 0 1 12 0M14 16a5 5 0 0 1 7 4"/></>,
    roles: <><path d="M12 3 9.5 8 4 9l4 4-1 6 5-3 5 3-1-6 4-4-5.5-1z"/></>,
  } as const;
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}
