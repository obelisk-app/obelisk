'use client';

import { setDmOptInEnabled } from '@/services/chat/dm/opt-in';

/** The DM opt-in card's one action: turn DMs on for this device, then tell the host. */
export function useDmOptInGate(onEnable?: () => void) {
  return {
    enable: () => {
      setDmOptInEnabled(true);
      onEnable?.();
    },
  };
}
