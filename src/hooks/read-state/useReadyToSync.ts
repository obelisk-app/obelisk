'use client';

import { useEffect, useState } from 'react';
import { useConnectionState, useGroupMetadataEose } from '@/services/nostr-bridge';

/**
 * Gate the P2 relay-sync subscriptions on either the channel-menu having
 * painted (`groupMetadataEose`) or a 1000ms post-`Connected` timer. Exposed
 * as a hook so it's straightforward to mock in unit tests.
 */
export function useReadyToSync(): boolean {
  const groupMetadataEose = useGroupMetadataEose();
  const conn = useConnectionState();
  // The grace-timer half of the contract is the only stateful piece:
  // once it fires we latch true and never tear it down. The EOSE half
  // is a pure derivation, which keeps setState out of the effect body
  // (only inside the setTimeout callback).
  const [graceReady, setGraceReady] = useState(false);
  useEffect(() => {
    if (graceReady) return;
    if (conn !== 'Connected') return;
    const t = setTimeout(() => setGraceReady(true), 1000);
    return () => clearTimeout(t);
  }, [graceReady, conn]);
  return groupMetadataEose || graceReady;
}
