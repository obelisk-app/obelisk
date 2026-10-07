/**
 * The social relay set as rows for a status list: each configured relay,
 * its status (when the watcher has one) and the state its dot shows. Shared
 * by the header pill's popover and the side column's relays widget, so the
 * two can never disagree about a relay.
 */
import { normalizeRelayUrl } from '@/services/social/relays';
import type { RelayState, RelayStatus } from '@/services/social/relay-status';

export interface RelayStatusRow {
  /** The relay as configured (the list key, and what a retry probes). */
  relay: string;
  status: RelayStatus | undefined;
  state: RelayState;
}

/** The dot colour for each relay state. */
export const RELAY_STATE_DOT: Readonly<Record<RelayState, string>> = {
  connected: 'bg-lc-green',
  connecting: 'bg-amber-400 animate-pulse',
  unknown: 'bg-lc-border',
  failed: 'bg-red-500',
  offline: 'bg-lc-muted',
};

/** One row per configured relay; a relay the watcher has not reported on yet is `unknown`. */
export function relayStatusRows(
  relays: readonly string[],
  statuses: Readonly<Record<string, RelayStatus>>,
): RelayStatusRow[] {
  return relays.map((relay) => {
    const url = normalizeRelayUrl(relay);
    const status = url ? statuses[url] : undefined;
    return { relay, status, state: status?.state ?? 'unknown' };
  });
}

/** "120ms" once a round trip was measured, else nothing. */
export function relayLatencyLabel(status: RelayStatus | undefined): string {
  return status?.latencyMs != null ? `${status.latencyMs}ms` : '';
}
