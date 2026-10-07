'use client';

import type { SettingsTab } from '../settings/SettingsSections';
import { UserProfileCard } from './UserProfileCard';
import { UserSettingsModal } from './UserSettingsModal';
import { panelPositionStyle, useUserPanel, type PanelAnchor } from '@/hooks/shell/user-panel/useUserPanel';

// The sections live in `./settings`; re-exported so existing importers of
// this module keep working.
export {
  AdvancedSettingsSection,
  AppearanceSettingsSection,
  GeneralSettingsSection,
  NotificationsSettingsSection,
  PreferencesPanel,
  PrivacySettingsSection,
  RelaysSettingsSection,
  type SettingsTab,
} from '../settings/SettingsSections';

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
  initialTab?: SettingsTab | 'preferences';
}

export default function UserPanel({ pubkey, isMe, onClose, onLogout, anchor, initialEditing = false, initialTab = 'profile' }: UserPanelProps) {
  const vm = useUserPanel({ pubkey, onClose, onLogout, initialEditing, initialTab });

  if (typeof document === 'undefined') return null;

  if (vm.editing && isMe) {
    return (
      <UserSettingsModal
        pubkey={pubkey}
        meta={vm.meta}
        displayName={vm.displayName}
        settingsTab={vm.settingsTab}
        setSettingsTab={vm.setSettingsTab}
        onDone={vm.finishEditing}
        onLogout={vm.logout}
      />
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
