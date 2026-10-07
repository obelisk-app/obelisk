/**
 * What the header's relay pill reports: the state of the NIP-29 relay the
 * session is bound to, read from the bridge's access verdict, and which
 * tier the button itself stands for.
 */
import type { RelayAccessState } from '@/services/nostr-bridge';
import type { RelayState } from '@/services/social/relay-status';

/**
 * The active relay as a dot state. `access` is the bridge's NIP-42 and
 * whitelist verdict: connected AND allowed to read, which is what "chat
 * works" means. Still authenticating (or not yet known) reads as
 * connecting; anything refusing reads as failed.
 */
export function activeRelayState(access: RelayAccessState): RelayState {
  if (access === 'ok') return 'connected';
  if (access === 'authenticating' || access === 'unknown') return 'connecting';
  return 'failed';
}

/** The active relay row's dot colour, by access verdict. */
export function accessDotClass(access: RelayAccessState): string {
  if (access === 'ok') return 'bg-lc-green';
  if (access === 'authenticating') return 'bg-amber-400 animate-pulse';
  if (access === 'unknown') return 'bg-lc-border';
  return 'bg-red-500';
}
