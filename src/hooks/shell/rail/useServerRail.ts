'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConfiguredRelays, useCurrentRelayUrl } from '@/services/nostr-bridge';
import { confirmAndRemoveRelay } from '@/services/relay/remove-relay';
import type { RailMode } from '@/utils/shell/desktop/desktop-layout';

/** The desktop rail: the configured relays, which one is lit, removing one, and the add-relay dialog. */
export function useServerRail(mode: RailMode) {
  const t = useTranslations();
  const relays = useConfiguredRelays();
  const currentRelay = useCurrentRelayUrl();
  const [adding, setAdding] = useState(false);
  return {
    relays,
    /** A relay tile is lit only while the rail is on relays and it is the open one. */
    isActive: (url: string) => mode.kind === 'relay' && currentRelay === url,
    /** Asks first; the last relay cannot be removed. */
    remove: (url: string) => void confirmAndRemoveRelay(url, relays.length, t),
    adding,
    openAdd: () => setAdding(true),
    closeAdd: () => setAdding(false),
  };
}
