/**
 * NIP-17 DM inbox relay list (kind 10050).
 *
 * Other Nostr clients sending us gift-wrapped DMs (NIP-17) look up our kind
 * 10050 event to know which relays to publish the wrap to. If we never
 * publish one, our DMs only arrive from clients that happen to share a relay
 * with us. Calling publishInboxRelays once per session fixes that.
 *
 * We publish the same relay set NDK is connected to at the time of call,
 * so receivers reach us through channels we actually listen on.
 */

import { getNDK } from './nostr';
import { getSyncState, setSyncState } from './dm-cache';
import { KIND_DM_INBOX_RELAYS } from './nip-kinds';

const REPUBLISH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Publish a kind 10050 event listing the relays the current user wants to
 * receive NIP-17 DMs on. Idempotent-ish: skips if published within the last
 * 24h (tracked via dm-cache sync state).
 */
export async function publishInboxRelays(myPubkey: string): Promise<boolean> {
  const ndk = getNDK();
  if (!ndk.signer) return false;

  const sync = getSyncState(myPubkey);
  if (Date.now() - sync.inboxRelaysPublishedAt < REPUBLISH_INTERVAL_MS) {
    return false; // still fresh
  }

  try {
    const { NDKEvent } = await import('@nostr-dev-kit/ndk');
    const event = new NDKEvent(ndk);
    event.kind = KIND_DM_INBOX_RELAYS;
    event.content = '';
    const relayUrls = listConnectedRelayUrls(ndk);
    event.tags = relayUrls.map((url) => ['relay', url]);

    await event.publish();
    setSyncState(myPubkey, { inboxRelaysPublishedAt: Date.now() });
    return true;
  } catch (err) {
    console.warn('[dm-inbox] publishInboxRelays failed:', err);
    return false;
  }
}

/**
 * Read the relay URLs currently registered on the NDK pool. Isolated from
 * `publishInboxRelays` so tests can stub it without mocking the whole NDK
 * event machinery.
 */
export function listConnectedRelayUrls(ndk: ReturnType<typeof getNDK>): string[] {
  const urls = new Set<string>();
  try {
    const pool = ndk.pool;
    if (pool && pool.relays) {
      // NDK exposes relays as a Map<url, NDKRelay>
      if (typeof pool.relays.keys === 'function') {
        for (const url of pool.relays.keys()) {
          if (typeof url === 'string' && url.startsWith('wss://')) urls.add(url);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return Array.from(urls);
}
