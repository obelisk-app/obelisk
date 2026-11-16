'use client';

import { useConcordNavigation } from '@/store/chat/concord';
import { useConcordClient } from '@/hooks/chat/concord/useConcordClient';
import { communityRailEntries } from '@/utils/chat/concord/community-rail';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConfiguredRelays, useCurrentRelayUrl } from '@/services/nostr-bridge';
import { confirmAndRemoveRelay } from '@/services/relay/remove-relay';
import type { RailMode } from '@/utils/shell/desktop/desktop-layout';

/** The desktop rail: the configured relays, which one is lit, removing one, and the add-relay dialog. */
export function useServerRail(mode: RailMode) {
  const t = useTranslations();
  const concord = useConcordClient();
  const concordOpen = useConcordNavigation(s => s.open);
  const relays = useConfiguredRelays();
  const currentRelay = useCurrentRelayUrl();
  const [adding, setAdding] = useState(false);
  return {
    relays, entries: communityRailEntries(relays, concord.railCommunities),
    isConcordActive: (id: string) => concord.open && concord.communityId === id,
    selectConcord: concord.selectCommunity,
    leaveConcord: (pick: () => void) => { useConcordNavigation.getState().close(); pick(); },
    /** A relay tile is lit only while the rail is on relays and it is the open one. */
    isActive: (url: string) => !concordOpen && mode.kind === 'relay' && currentRelay === url,
    /** Asks first; the last relay cannot be removed. */
    remove: (url: string) => void confirmAndRemoveRelay(url, relays.length, t),
    adding,
    openAdd: () => setAdding(true),
    closeAdd: () => setAdding(false),
  };
}
