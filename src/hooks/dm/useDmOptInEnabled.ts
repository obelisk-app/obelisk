'use client';

import { usePreferences } from '@/hooks/usePreferences';

/** Whether the user has turned direct messages on (`isDmOptInEnabled`, as a hook). */
export function useDmOptInEnabled(): boolean {
  return usePreferences().directMessagesEnabled;
}
