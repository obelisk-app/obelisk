import { useMemo, useState } from 'react';
import { useConfiguredRelays } from '@/services/nostr-bridge';

export function useAddRelay() {
  const [creating, setCreating] = useState(false);
  const configured = useConfiguredRelays();
  const configuredSet = useMemo(() => new Set(configured), [configured]);
  return {
    creating,
    openCreate: () => setCreating(true),
    backToJoin: () => setCreating(false),
    isConfigured: (url: string) => configuredSet.has(url),
  };
}
