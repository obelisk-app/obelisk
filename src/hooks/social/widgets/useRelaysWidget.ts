import { useMemo, useSyncExternalStore } from 'react';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { getRelayStatuses, probeRelay, subscribeRelayStatus } from '@/services/social/relay-status';
import { openSettings } from '@/utils/settings/open-settings';
import { relayStatusRows } from '@/utils/social/relay-status-rows';

/**
 * The relays widget's view model: one row per social relay with its live
 * status. It reads the watcher's store but does not start the watcher; the
 * header pill owns that and is always mounted.
 */
export function useRelaysWidget() {
  const relays = usePreferences().socialRelays;
  const statuses = useSyncExternalStore(subscribeRelayStatus, getRelayStatuses, getRelayStatuses);
  const rows = useMemo(() => relayStatusRows(relays, statuses), [relays, statuses]);
  return {
    rows,
    retry: (relay: string) => void probeRelay(relay),
    manage: () => openSettings('relays'),
  };
}
