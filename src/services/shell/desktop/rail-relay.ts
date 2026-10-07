import { nostrActions } from '@/services/nostr-bridge';

/**
 * Switch to a relay picked on the desktop rail. Picking the relay already
 * open does nothing; a failed switch is logged rather than thrown, so the
 * caller can always close its drawer afterwards.
 */
export async function switchRelayFromRail(url: string, currentRelay: string): Promise<void> {
  try {
    if (url !== currentRelay) await nostrActions.switchRelay(url);
  } catch (err) {
    console.warn('[appshell] switchRelay from rail failed', err);
  }
}
