/**
 * NIP-17 DM inbox relay list (kind 10050).
 *
 * Other Nostr clients sending us gift-wrapped DMs (NIP-17) look up our kind
 * 10050 event to know which relays to publish the wrap to. Without one, our
 * DMs only arrive from clients that happen to share a relay with us.
 *
 * This is a single-shot publish helper. The caller decides when to invoke
 * (e.g. once per DM-session bootstrap, or on signer-attach).
 */

import { getNDK } from '@/lib/nostr';
import { KIND_DM_INBOX_RELAYS } from '@/lib/nip-kinds';

/**
 * Publish a kind 10050 event listing the relays the current user wants to
 * receive NIP-17 DMs on. Returns true on success, false if no signer or
 * publish fails.
 */
export async function publishInboxRelays(_myPubkey: string): Promise<boolean> {
  const ndk = getNDK();
  if (!ndk.signer) return false;

  try {
    const { NDKEvent } = await import('@nostr-dev-kit/ndk');
    const event = new NDKEvent(ndk);
    event.kind = KIND_DM_INBOX_RELAYS;
    event.content = '';
    const relayUrls = listConnectedRelayUrls(ndk);
    event.tags = relayUrls.map((url) => ['relay', url]);
    await event.publish();
    return true;
  } catch (err) {
    console.warn('[dm-inbox] publishInboxRelays failed:', err);
    return false;
  }
}

/**
 * Read the relay URLs currently registered on the NDK pool. Isolated so
 * tests can stub it without mocking the whole NDK event machinery.
 */
export function listConnectedRelayUrls(ndk: ReturnType<typeof getNDK>): string[] {
  const urls = new Set<string>();
  try {
    const pool = ndk.pool;
    if (pool && pool.relays) {
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
