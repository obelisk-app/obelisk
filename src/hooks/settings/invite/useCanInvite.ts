'use client';

import { useEffect, useState } from 'react';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useMyPubkey, useSignerReady } from '@/hooks/session/useSession';
import { fetchInviteStatus } from '@/services/relay/relay-invite-api';

/**
 * Whether this account may create invite links on the relay in view: the
 * relay's operator granted it, or it administers the relay. Decides whether
 * settings shows "Invite people" at all. False on any relay without the API.
 */
export function useCanInvite(): boolean {
  const relay = useCurrentRelayUrl();
  const pubkey = useMyPubkey();
  const signerReady = useSignerReady();
  const [answer, setAnswer] = useState<{ key: string; can: boolean } | null>(null);
  const key = `${relay}|${pubkey ?? ''}`;

  useEffect(() => {
    if (!pubkey || !signerReady || !relay) return;
    let cancelled = false;
    void fetchInviteStatus(relay, pubkey).then((me) => {
      if (!cancelled) setAnswer({ key, can: !!me?.can_mint });
    });
    return () => {
      cancelled = true;
    };
  }, [relay, pubkey, signerReady, key]);

  return answer?.key === key && answer.can;
}
