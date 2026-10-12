'use client';

import { useCallback, useEffect } from 'react';
import { useBridge, useDmLock } from '@/services/nostr-bridge';
import { useDmOptInEnabled } from '@/hooks/chat/dm/unlock/useDmOptInEnabled';

/** Opening a thread unlocks that peer; the list requires explicit discovery.
 * A refusal waits for the user's retry instead of repeating signer prompts. */
export function useDmUnlock(peer?: string) {
  const bridge = useBridge();
  const enabled = useDmOptInEnabled();
  const { status, pendingDecryptions = 0, failedDecryptions = 0, unopened, encryptedMessages = [] } = useDmLock();
  useEffect(() => {
    // The bridge's own value, not the hook's: on the first render the hook
    // still answers its initial `locked`, and a surface remounted after a
    // refusal must not prompt again by itself.
    if (!bridge || !enabled || !peer || bridge.dmLock.get().status === 'failed') return;
    void bridge.unlockDirectMessages(peer);
  }, [bridge, enabled, peer]);
  const retry = useCallback(() => {
    if (bridge) void bridge.unlockDirectMessages(peer, { retryFailed: true });
  }, [bridge, peer]);
  const discover = useCallback(() => {
    if (bridge) void bridge.unlockDirectMessages();
  }, [bridge]);
  const visible = peer ? encryptedMessages.filter((message) => message.counterparty === peer) : encryptedMessages;
  const failures = visible.filter((message) => message.status === 'failed');
  return { status, pendingDecryptions: peer ? visible.filter((message) => message.status === 'decrypting').length : pendingDecryptions,
    failedDecryptions: peer ? failures.length : failedDecryptions, failures,
    unopened: peer ? 0 : unopened.length, enabled, retry, discover };

}
