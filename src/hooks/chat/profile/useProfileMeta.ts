'use client';

import { useEffect, useMemo } from 'react';
import { nostrActions, useUserMetadata, type JsUserMetadata } from '@/services/nostr-bridge';
import { stripEmpty } from '@/components/chat/profile/profile-labels';

/**
 * A profile's kind 0: the live bridge copy laid over the server-fetched one
 * field by field, so a relay copy that arrives with only `name` doesn't
 * blank the picture the server already resolved. Asks the bridge to fetch
 * the profile if it has not seen it.
 */
export function useProfileMeta(pubkey: string, initialMeta: Partial<JsUserMetadata> | null) {
  const live = useUserMetadata(pubkey);
  const meta = useMemo(
    () => (initialMeta ? { ...initialMeta, ...stripEmpty(live) } : live),
    [initialMeta, live],
  );

  useEffect(() => {
    void nostrActions.ensureUserMetadata(pubkey).catch(() => {});
  }, [pubkey]);

  return meta;
}
