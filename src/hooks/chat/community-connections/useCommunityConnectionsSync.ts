import { useEffect } from 'react';
import { useBridge, startCommunityConnectionsSync } from '@/services/nostr-bridge';
import { useIsLoggedIn, useMyPubkey } from '@/hooks/session/useSession';

export function useCommunityConnectionsSync() {
  const bridge = useBridge();
  const loggedIn = useIsLoggedIn();
  const pubkey = useMyPubkey();
  useEffect(() => {
    if (bridge && loggedIn && pubkey) return startCommunityConnectionsSync(bridge);
  }, [bridge, loggedIn, pubkey]);
}
