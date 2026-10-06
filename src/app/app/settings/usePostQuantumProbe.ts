'use client';

import { useEffect, useState } from 'react';
import { useMyLoginMethod, useMyPubkey } from '@/services/nostr-bridge';
import { selfPqState, type SelfPqState } from '@/services/pq/capability';

/**
 * Ask `selfPqState()` what post-quantum sending looks like for this account
 * and signer. `state` is `null` while checking.
 */
export function usePostQuantumProbe(): { myPubkey: string | null; state: SelfPqState | null } {
  const myPubkey = useMyPubkey();
  const loginMethod = useMyLoginMethod();
  // The result is stamped with the (pubkey, method) it answers for, so a
  // different account or login method reads as "checking" again without a
  // reset step.
  const probeKey = `${myPubkey ?? ''}|${loginMethod ?? ''}`;
  const [probe, setProbe] = useState<{ key: string; state: SelfPqState } | null>(null);
  const state = probe?.key === probeKey ? probe.state : null;

  useEffect(() => {
    if (!myPubkey) return;
    let cancelled = false;
    selfPqState(myPubkey, loginMethod).then((next) => {
      if (!cancelled) setProbe({ key: probeKey, state: next });
    });
    return () => {
      cancelled = true;
    };
  }, [myPubkey, loginMethod, probeKey]);

  return { myPubkey, state };
}
