'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { useMyPubkey, useUserMetadata as useProfile } from '@/services/nostr-bridge';
import { onOpenSettings, revealSettingsSection, type SettingsSection } from '@/utils/settings/open-settings';
import { useChatStore } from '@/store/chat';
import { profileHandle, profileName } from '@/utils/shell/panes/sidebar/sidebar-me';

/**
 * The account pill's view model: who is signed in, and the settings panel
 * it opens from the gear (on preferences) or from an "open settings"
 * request anywhere in the app (on the section asked for).
 */
export function useSidebarMe() {
  const myPubkey = useMyPubkey();
  const meta = useProfile(myPubkey);
  const [editing, setEditing] = useState(false);
  // Set when the panel was opened by a "manage these" request rather than by
  // the gear, so it lands on that section and scrolls to the right block.
  const [pendingSection, setPendingSection] = useState<SettingsSection | null>(null);

  useEffect(() => onOpenSettings(({ section }) => {
    setPendingSection(section);
    setEditing(true);
    revealSettingsSection(section);
  }), []);

  return {
    myPubkey,
    meta,
    name: profileName(meta),
    handle: myPubkey ? profileHandle(meta, myPubkey) : '',
    editing,
    initialTab: pendingSection ?? 'profile',
    openProfile: (event: MouseEvent) => {
      if (myPubkey) useChatStore.getState().openProfilePopup(myPubkey, { x: event.clientX, y: event.clientY });
    },
    /** The gear is "preferences"; editing the profile is on the profile card. */
    openPreferences: () => { setPendingSection('general'); setEditing(true); },
    closePanel: () => { setEditing(false); setPendingSection(null); },
  };
}
