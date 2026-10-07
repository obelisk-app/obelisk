'use client';

import { useMemo, useState } from 'react';
import { useConfiguredRelays } from '@/services/nostr-bridge';

export type AddRelayTab = 'suggested' | 'custom';

/** The add-relay dialog: which tab is open, and which suggestions are already on the rail. */
export function useAddRelayModal() {
  const [tab, setTab] = useState<AddRelayTab>('suggested');
  const configured = useConfiguredRelays();
  const configuredSet = useMemo(() => new Set(configured), [configured]);
  return {
    tab,
    showSuggested: () => setTab('suggested'),
    showCustom: () => setTab('custom'),
    isAdded: (url: string) => configuredSet.has(url),
  };
}
