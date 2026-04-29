/**
 * NIP-17 DM inbox relay list (kind 10050).
 *
 * Other Nostr clients sending us gift-wrapped DMs (NIP-17) look up our kind
 * 10050 event to know which relays to publish the wrap to. Without one, our
 * DMs only arrive from clients that happen to share a relay with us.
 */

import { getPool } from '@nostr-wot/data';
import type { NostrSigner } from '@nostr-wot/signers';
import type { EventTemplate } from 'nostr-tools';
import { KIND_DM_INBOX_RELAYS } from '@/lib/nip-kinds';

/**
 * Publish a kind 10050 event listing the relays the current user wants to
 * receive NIP-17 DMs on. Returns true on success, false if publish fails.
 */
export async function publishInboxRelays(signer: NostrSigner, relays: string[]): Promise<boolean> {
  try {
    const relayUrls = relays.filter((u) => u.startsWith('wss://'));
    const template: EventTemplate = {
      kind: KIND_DM_INBOX_RELAYS,
      created_at: Math.floor(Date.now() / 1000),
      tags: relayUrls.map((url) => ['relay', url]),
      content: '',
    };
    const event = await signer.signEvent(template);
    const pool = getPool();
    await Promise.allSettled(pool.publish(relayUrls, event));
    return true;
  } catch (err) {
    console.warn('[dm-inbox] publishInboxRelays failed:', err);
    return false;
  }
}
