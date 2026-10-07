import { useMemo, useState } from 'react';
import { useConfiguredRelays } from '@/services/nostr-bridge';

/** The phone add-relay sheet: which tab is open, and which suggestions are already in the rail. */
export function useAddRelaySheet() {
  const [tab, setTab] = useState<'suggested' | 'custom'>('suggested');
  const configured = useConfiguredRelays();
  const configuredSet = useMemo(() => new Set(configured), [configured]);
  return {
    tab,
    setTab,
    isConfigured: (url: string) => configuredSet.has(url),
  };
}
