'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useState } from 'react';
import { nostrActions, useUserMetadata as useProfile } from '@/services/nostr-bridge';
import type { SettingsTab } from '../settings/SettingsSections';
import { UserProfileCard } from './UserProfileCard';
import { UserSettingsModal } from './UserSettingsModal';
import { panelPositionStyle, safeNpub, useUserPanelEffects, type PanelAnchor } from '@/hooks/shell/user-panel/useUserPanel';

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
  const meta = useProfile(pubkey);
  const [editing, setEditing] = useState(initialEditing);
  // `preferences` is the pre-sections name for "the app settings" - land on
  // the first of them.
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(initialTab === 'preferences' ? 'general' : initialTab);
  useUserPanelEffects(pubkey, editing, onClose);

  const npub = safeNpub(pubkey);
  const displayName = displayNameFor(pubkey, meta);
  const logout = () => {
    onClose();
    if (onLogout) onLogout();
    else void nostrActions.logout();
  };

  if (typeof document === 'undefined') return null;

  if (editing && isMe) {
    return (
      <UserSettingsModal
        pubkey={pubkey}
        meta={meta}
        displayName={displayName}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        onDone={() => { setEditing(false); onClose(); }}
        onLogout={logout}
      />
    );
  }

  return (
    <UserProfileCard
      pubkey={pubkey}
      meta={meta}
      displayName={displayName}
      npub={npub}
      isMe={isMe}
      style={panelPositionStyle(anchor, { width: window.innerWidth, height: window.innerHeight })}
      onClose={onClose}
      onEdit={() => setEditing(true)}
      onLogout={logout}
    />
  );
}
