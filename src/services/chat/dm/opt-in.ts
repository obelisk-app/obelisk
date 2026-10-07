'use client';

import { getBridgeImpl } from '@/services/nostr-bridge';
import { getPreferences, setPreference } from '@/services/preferences/preferences';
import { DM_OPT_IN_PREFERENCE_KEY } from '@/constants/chat/dm';

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
