'use client';

import { useState } from 'react';
import { useConfiguredRelays } from '@/services/nostr-bridge';
import { openSettings } from '@/services/settings/open-settings';

/** The operator editors the server-settings menu opens. */
export type RelayAdminEditor = 'layout' | 'branding' | 'emojis' | 'members' | 'roles';

const ALL_CLOSED: Readonly<Record<RelayAdminEditor, boolean>> = {
  layout: false, branding: false, emojis: false, members: false, roles: false,
};

/**
 * Which operator editors are open. Each opens and closes on its own, over
 * the settings menu, as five separate flags did before.
 */
export function useRelayAdminModals() {
  const [opened, setOpened] = useState(ALL_CLOSED);
  const configuredRelays = useConfiguredRelays();
  return {
    opened,
    configuredRelays,
    invite: (relay: string) => openSettings('invites', { relay }),
    open: (editor: RelayAdminEditor) => setOpened((o) => ({ ...o, [editor]: true })),
    close: (editor: RelayAdminEditor) => setOpened((o) => ({ ...o, [editor]: false })),
  };
}
