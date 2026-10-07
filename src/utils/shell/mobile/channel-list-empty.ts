import type { RelayAccessState } from '@/services/nostr-bridge';

/** Why the phone's channel list is empty; the screen turns it into copy. */
export type ChannelListEmptyReason = 'loading' | 'offline' | 'whitelist' | 'network' | 'none';

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
