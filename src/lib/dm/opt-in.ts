'use client';

import { getBridgeSync } from '@/lib/nostr-bridge/client';
import { getPreferences, setPreference, usePreferences } from '@/lib/preferences';

export const DM_OPT_IN_STORAGE_KEY = 'obelisk:preferences';
export const DM_OPT_IN_PREFERENCE_KEY = 'directMessagesEnabled';

export function isDmOptInEnabled(): boolean {
  return getPreferences().directMessagesEnabled;
}

export function setDmOptInEnabled(enabled: boolean): void {
  const wasEnabled = getPreferences().directMessagesEnabled;
  setPreference(DM_OPT_IN_PREFERENCE_KEY, enabled);
  if (wasEnabled && !enabled) {
    getBridgeSync()?.disableDirectMessages();
  }
}

export function useDmOptInEnabled(): boolean {
  return usePreferences().directMessagesEnabled;
}
