'use client';

import { usePreferences } from '@/hooks/preferences/usePreferences';
import { openSettings } from '@/utils/settings/open-settings';
import { serverBannerParts } from '@/utils/shell/mobile/rail';

/**
 * The phone's server banner (`mobile/rail/MobileServerBanner.tsx`): the
 * relay's host, icon letter and website, and what the relay status pill
 * beside the signing indicator needs.
 */
export function useMobileServerBanner(relayUrl: string | null) {
  const socialRelays = usePreferences().socialRelays;
  return {
    ...serverBannerParts(relayUrl),
    socialRelays,
    openRelaySettings: () => openSettings('relays'),
  };
}
