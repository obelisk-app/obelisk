import { useEffect, useState } from 'react';
import type { RelayAccessState } from '@/services/nostr-bridge';

/** Why the phone's channel list is empty; the screen turns it into copy. */
export type ChannelListEmptyReason = 'loading' | 'offline' | 'whitelist' | 'network' | 'none';

/** How long a connected relay gets to finish its kind 39000 stream. */
const EOSE_GRACE_MS = 6000;

/**
 * Pick the empty-state reason. Without this the user can't tell whether the
 * relay is still loading, blocked them, or genuinely has no channels: all
 * three used to render as "No channels yet".
 *
 * Precedence (highest first):
 *   - offline: the device has no network.
 *   - whitelist: the relay rejects reads with auth-required or restricted.
 *     Even "connected", the user won't see channels until whitelisted.
 *   - network: connection failed or dropped, or the relay is unreachable.
 *   - loading: connecting, authenticating, or connected but the kind 39000
 *     EOSE hasn't had time to land.
 *   - none: the relay finished its stream and returned zero groups.
 *
 * Connected past the grace period, access ok, but no EOSE: most relays that
 * silently filter unauthorized reads accept the REQ and never close it, so
 * that reads as a whitelist symptom rather than "none".
 */
export function channelListEmptyReason(
  relayAccess: RelayAccessState,
  connectionState: string,
  metadataEose: boolean,
  waited: boolean,
): ChannelListEmptyReason {
  if (connectionState === 'Offline') return 'offline';
  if (relayAccess === 'auth-required' || relayAccess === 'restricted') return 'whitelist';
  if (
    relayAccess === 'unreachable'
    || relayAccess === 'error'
    || connectionState === 'Disconnected'
    || connectionState.startsWith('Error')
  ) return 'network';
  if (
    connectionState !== 'Connected'
    || relayAccess === 'unknown'
    || relayAccess === 'authenticating'
    || (!metadataEose && !waited)
  ) return 'loading';
  return metadataEose ? 'none' : 'whitelist';
}

/** The reason for the current (connection, access) pair, after its grace period. */
export function useChannelListEmptyReason(
  relayAccess: RelayAccessState,
  connectionState: string,
  metadataEose: boolean,
): ChannelListEmptyReason {
  // Stamped with the (connection, access) pair it was measured for, so a
  // change in either starts a fresh wait with no reset step.
  const waitKey = `${connectionState}|${relayAccess}`;
  const [waitedFor, setWaitedFor] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setWaitedFor(waitKey), EOSE_GRACE_MS);
    return () => clearTimeout(t);
  }, [waitKey]);
  return channelListEmptyReason(relayAccess, connectionState, metadataEose, waitedFor === waitKey);
}
