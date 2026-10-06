'use client';

import { getBridgeImpl } from '@/services/nostr-bridge';
import { getPreferences, setPreference } from '@/services/preferences';

export const DM_OPT_IN_STORAGE_KEY = 'obelisk:preferences';
export const DM_OPT_IN_PREFERENCE_KEY = 'directMessagesEnabled';

export function isDmOptInEnabled(): boolean {
  return getPreferences().directMessagesEnabled;
}

export function setDmOptInEnabled(enabled: boolean): void {
  const wasEnabled = getPreferences().directMessagesEnabled;
  setPreference(DM_OPT_IN_PREFERENCE_KEY, enabled);
  if (wasEnabled && !enabled) {
    getBridgeImpl()?.disableDirectMessages();
  }
}
