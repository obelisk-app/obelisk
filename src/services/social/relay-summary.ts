/**
 * The whole relay set as one line.
 *
 * Status was only visible inside relay settings, which is the one place you
 * go *after* you already suspect something is wrong. This is the version
 * that fits in a toolbar: how many of your relays are answering, and the
 * worst state among them, which is what decides the colour.
 */
import { normalizeRelayUrl } from './relays';
import type { RelayState, RelayStatus } from './relay-status-store';

export type RelaySummary = {
  total: number;
  connected: number;
  state: RelayState;
};

export function relayStatusSummary(
  relays: readonly string[],
  statuses: Record<string, RelayStatus>,
): RelaySummary {
  const total = relays.length;
  let connected = 0;
  let anyFailed = false;
  let anyOffline = false;
  let anyPending = false;

  for (const relay of relays) {
    const url = normalizeRelayUrl(relay);
    const status = url ? statuses[url] : undefined;
    switch (status?.state) {
      case 'connected': connected += 1; break;
      case 'failed': anyFailed = true; break;
      case 'offline': anyOffline = true; break;
      default: anyPending = true; break;
    }
  }

  // Offline beats everything: N relays failing because the laptop's wifi
  // dropped is one problem, not N.
  const state: RelayState = anyOffline
    ? 'offline'
    : total === 0
      ? 'unknown'
      : connected === total
        ? 'connected'
        : connected > 0
          // Partial connectivity still reads green: the feed works. The
          // count next to it is what says "not all of them".
          ? 'connected'
          // Nothing connected. A single failed relay beside three we simply
          // have not heard from is not an outage, and reporting it red was
          // how the header came to show a scarlet `0/4` on chat screens,
          // which never read the social relays at all. Only report failure
          // once there is nothing left that might still answer.
          : anyPending
            ? 'connecting'
            : anyFailed
              ? 'failed'
              : 'unknown';

  return { total, connected, state };
}
