import { BoundedMap } from '@nostr-wot/relay/hub';
import { useEffect } from 'react';
import { useBridge } from '@/services/nostr-bridge';
import { PROFILE_OPEN_REFRESH_MS } from '@/constants/nostr-bridge/profile';

const refreshedAt = new BoundedMap<string, number>({ maxEntries: 500, policy: 'lru' });

/** Revalidate on opening and returning to an open profile, without polling. */
export function useProfileRefresh(pubkey: string) {
  const bridge = useBridge();
  useEffect(() => {
    if (!bridge) return;
    const refresh = () => {
      if (Date.now() - (refreshedAt.peek(pubkey) ?? -Infinity) < PROFILE_OPEN_REFRESH_MS) return;
      refreshedAt.set(pubkey, Date.now());
      void Promise.resolve().then(() => bridge.refreshUserMetadata(pubkey)).catch(() => {});
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [bridge, pubkey]);
}
