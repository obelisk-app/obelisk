'use client';

import { useEffect } from 'react';
import { useIsLoggedIn } from '@/services/nostr-bridge';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { initSocial } from '@/services/social/pool';
import { useIsMobile } from '@/hooks/common/useIsMobile';
import { useSessionNoticeToast } from '@/hooks/shell/login/useSessionNoticeToast';

/**
 * The /app gate's view model: which shell to paint (`isMobile`, `null`
 * before the client has asked `matchMedia`) and whether the read-state root
 * mounts. It also points `@nostr-wot/data` at the user's social relays
 * before any feed read: without that the SDK would fall back to its own
 * defaults, so a user who configured their relays would still be reading
 * from somewhere else.
 */
export function useAppGate() {
  const isMobile = useIsMobile();
  const loggedIn = useIsLoggedIn();
  const socialRelays = usePreferences().socialRelays;
  useSessionNoticeToast();

  useEffect(() => {
    initSocial(socialRelays);
  }, [socialRelays]);

  return { isMobile, loggedIn };
}
