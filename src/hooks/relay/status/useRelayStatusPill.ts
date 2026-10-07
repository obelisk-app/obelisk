import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useConnectionState, useRelayAccess } from '@/services/nostr-bridge';
import {
  getRelayStatuses, probeRelay, relayStatusSummary, subscribeRelayStatus, watchRelays,
} from '@/services/social/relay-status';
import { shortHost } from '@/utils/relay-url/url-host';
import { connectionLabel } from '@/utils/relay/relay-status';
import { relayStatusRows } from '@/utils/social/relay-status-rows';
import { activeRelayState } from '@/utils/relay/relay-status-pill';

/**
 * The header relay pill's view model: the social relay set's live status
 * (and the watcher behind it), the active chat relay's access verdict, what
 * the button itself reports, and the popover's open state.
 *
 * The pill (`src/components/relay/RelayStatusPill.tsx`) is the relay
 * module's, so its view model is too, though most of what it reads is the
 * social relay tier (`src/services/social/relay-status.ts`).
 */
export function useRelayStatusPill({
  relays,
  activeRelay,
  onOpenSettings,
  compact,
  indicate,
}: {
  relays: readonly string[];
  activeRelay?: string | null;
  onOpenSettings?: () => void;
  compact: boolean;
  indicate: 'social' | 'active';
}) {
  const t = useTranslations();
  const statuses = useSyncExternalStore(subscribeRelayStatus, getRelayStatuses, getRelayStatuses);
  const [open, setOpen] = useState(false);
  const connection = useConnectionState();
  const access = useRelayAccess(activeRelay ?? null);

  // The header is the surface that's always mounted, so it owns the watcher.
  // `watchRelays` is idempotent; settings calls it too.
  useEffect(() => { watchRelays(relays); }, [relays]);

  const summary = useMemo(() => relayStatusSummary(relays, statuses), [relays, statuses]);
  const rows = useMemo(() => relayStatusRows(relays, statuses), [relays, statuses]);

  const reportsActive = indicate === 'active' && !!activeRelay;

  return {
    open,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
    /** "Manage these": close the popover, then go where the host sends it. */
    manage: onOpenSettings
      ? () => {
        setOpen(false);
        onOpenSettings();
      }
      : undefined,
    retry: (relay: string) => void probeRelay(relay),
    access,
    connectionLabel: connectionLabel(connection, t),
    summary,
    rows,
    reportsActive,
    dotState: reportsActive ? activeRelayState(access) : summary.state,
    showCount: !compact && !reportsActive,
    label: reportsActive
      ? `${shortHost(activeRelay)} · ${t(`social.auth.${access}`)}`
      : summary.state === 'offline'
        ? t('social.relayOffline')
        : t('social.relaysConnected', { connected: summary.connected, total: summary.total }),
  };
}
