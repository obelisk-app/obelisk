'use client';

import type { SettingsSection } from '@/services/settings/open-settings';
import { UserProfileCard } from './UserProfileCard';
import { lazy, Suspense } from 'react';
import Skeleton from '@/components/ui/animations/Skeleton';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import { useTranslations } from 'next-intl';
import { useUserPanel } from '@/hooks/shell/user-panel/useUserPanel';
import { panelPositionStyle, type PanelAnchor } from '@/utils/shell/user-panel/panel-position';

const UserSettingsModal = lazy(() => import('./UserSettingsModal').then((module) => ({ default: module.UserSettingsModal })));

interface UserPanelProps {
  pubkey: string;
  isMe: boolean;
  onClose: () => void;
  onLogout?: () => void;
  /** Anchor (the trigger element) - panel is positioned relative to it. */
  anchor?: PanelAnchor;
  /** Open directly into the fullscreen edit modal. */
  initialEditing?: boolean;
  /**
   * Which settings tab to land on. `preferences` is what "manage my relays"
   * wants - the relay block lives there, and the panel otherwise always
   * opens on the profile tab.
   */
  initialTab?: SettingsSection | 'preferences';
}

export default function UserPanel({ pubkey, isMe, onClose, onLogout, anchor, initialEditing = false, initialTab = 'profile' }: UserPanelProps) {
  const t = useTranslations();
  const vm = useUserPanel({ pubkey, onClose, onLogout, initialEditing, initialTab });

  if (typeof document === 'undefined') return null;

  if (vm.editing && isMe) {
    return (
      <Suspense fallback={(
        <Modal onClose={vm.finishEditing} closeOnEscape={false} closeOnBackdrop={false} layerClassName="z-[100]" surface="card" panelClassName="mx-4 w-full max-w-4xl overflow-hidden" testId="desktop-settings-loading" aria-label={t('shell.user.settings')}>
          <ModalHeader title={t('shell.user.settings')} subtitle={t('common.loading')} onClose={vm.finishEditing} />
          <Skeleton className="m-4 h-64 rounded-xl" />
        </Modal>
      )}>
        <UserSettingsModal
          pubkey={pubkey}
          meta={vm.meta}
          displayName={vm.displayName}
          settingsTab={vm.settingsTab}
          setSettingsTab={vm.setSettingsTab}
          onDone={vm.finishEditing}
          onLogout={vm.logout}
        />
      </Suspense>
    );
  }

  return (
    <UserProfileCard
      pubkey={pubkey}
      meta={vm.meta}
      displayName={vm.displayName}
      npub={vm.npub}
      isMe={isMe}
      style={panelPositionStyle(anchor, { width: window.innerWidth, height: window.innerHeight })}
      onClose={onClose}
      onEdit={vm.startEditing}
      onLogout={vm.logout}
    />
  );
}
