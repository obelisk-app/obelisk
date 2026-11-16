import { useMemo, useState } from 'react';
import { useConfiguredRelays } from '@/services/nostr-bridge';

/** The add-relay flow shared by dialog and sheet: which tab is open, and which suggestions are already in the rail. */
export function useAddRelay(initialConcord = false) {
  const [concord, setConcord] = useState(initialConcord);
  const [tab, setTab] = useState<'suggested' | 'custom'>('suggested');
  const configured = useConfiguredRelays();
  const configuredSet = useMemo(() => new Set(configured), [configured]);
  return {
    concord, setConcord, communityType: concord ? 'encrypted' as const : 'standard' as const,
    setCommunityType: (value: 'standard' | 'encrypted') => setConcord(value === 'encrypted'),
    tab,
    setTab,
    isConfigured: (url: string) => configuredSet.has(url),
  };
}
