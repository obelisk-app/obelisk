import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { pageRelayHub } from '@/services/nostr-bridge';
import type { RelayStatus } from '@/services/social/relay-status';

/** Observe only the Concord identity's existing sockets. Never probe under the account identity. */
export function watchConcordRelayStatus(pubkey: string, listener: (rows: Record<string, RelayStatus>) => void) {
  const hub = pageRelayHub();
  const refresh = () => listener(Object.fromEntries(hub.statuses()
    .filter(row => row.identityId.startsWith(`concord:${pubkey}:`))
    .map(row => [normalizeRelayUrl(row.url), { url: row.url, state: row.connection === 'idle' ? 'unknown' : row.connection === 'reconnecting' ? 'connecting' : row.connection,
      latencyMs: null, notes: 0, lastChange: 0 } satisfies RelayStatus])));
  refresh();
  return hub.onStatus(refresh);
}
export function retryConcordRelay(pubkey: string, relay: string) {
  const hub = pageRelayHub();
  for (const row of hub.statuses()) {
    if (row.url.replace(/\/$/, '') === relay.replace(/\/$/, '') && row.identityId.startsWith(`concord:${pubkey}:`)) hub.dropSocket(row.url, row.identityId);
  }
}
