'use client';

import { useCallback, useEffect } from 'react';
import { useBridge, useDmLock, type DmLockStatus } from '@/services/nostr-bridge';
import { useDmOptInEnabled } from '@/hooks/chat/dm/unlock/useDmOptInEnabled';

/** Opening a thread unlocks that peer; the list requires explicit discovery.
 * A refusal waits for the user's retry instead of repeating signer prompts. */
export function useDmUnlock(peer?: string): { status: DmLockStatus; pendingDecryptions: number; failedDecryptions: number; unopened: number; enabled: boolean; retry: () => void; discover: () => void } {
  const bridge = useBridge();
  const enabled = useDmOptInEnabled();
  const { status, pendingDecryptions = 0, failedDecryptions = 0, unopened } = useDmLock();
  useEffect(() => {
    // The bridge's own value, not the hook's: on the first render the hook
    // still answers its initial `locked`, and a surface remounted after a
    // refusal must not prompt again by itself.
    if (!bridge || !enabled || !peer || bridge.dmLock.get().status === 'failed') return;
    void bridge.unlockDirectMessages(peer);
  }, [bridge, enabled, peer]);
  const retry = useCallback(() => {
    if (bridge) void bridge.unlockDirectMessages(peer);
  }, [bridge, peer]);
  const discover = useCallback(() => {
    if (bridge) void bridge.unlockDirectMessages();
  }, [bridge]);
  return { status, pendingDecryptions, failedDecryptions, unopened: unopened.length, enabled, retry, discover };
}
