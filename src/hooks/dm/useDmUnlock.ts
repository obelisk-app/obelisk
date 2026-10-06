'use client';

import { useCallback, useEffect } from 'react';
import { useBridge, useDmLock, type DmLockStatus } from '@/services/nostr-bridge';
import { useDmOptInEnabled } from '@/hooks/dm/useDmOptInEnabled';

/**
 * Open the DMs when a DM surface mounts: the person asked for them, so this
 * is the moment the signer may be asked to unwrap the DM key (once per page
 * session). Only from `locked`: a refusal (`failed`) waits for `retry`, so a
 * "no" is never answered with another prompt.
 */
export function useDmUnlock(): { status: DmLockStatus; retry: () => void } {
  const bridge = useBridge();
  const enabled = useDmOptInEnabled();
  const { status } = useDmLock();
  useEffect(() => {
    // The bridge's own value, not the hook's: on the first render the hook
    // still answers its initial `locked`, and a surface remounted after a
    // refusal must not prompt again by itself.
    if (!bridge || !enabled || bridge.dmLock.get().status !== 'locked') return;
    void bridge.unlockDirectMessages();
  }, [bridge, enabled, status]);
  const retry = useCallback(() => {
    if (bridge) void bridge.unlockDirectMessages();
  }, [bridge]);
  return { status, retry };
}
