import { getNDK } from './nostr';
import NDK, { NDKEvent, NDKSubscription, NDKFilter } from '@nostr-dev-kit/ndk';

export interface DMMessage {
  id: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  createdAt: number; // unix timestamp
}

/**
 * Sort participant pubkeys to create a canonical thread key.
 */
export function threadKey(pubkey1: string, pubkey2: string): [string, string] {
  return pubkey1 < pubkey2 ? [pubkey1, pubkey2] : [pubkey2, pubkey1];
}

/**
 * Send an encrypted DM using NIP-04 (kind 4).
 * NIP-17 gift wrap can be added later for better privacy.
 */
export async function sendDM(recipientPubkey: string, content: string): Promise<NDKEvent | null> {
  const ndk = getNDK();
  if (!ndk.signer) return null;

  const event = new NDKEvent(ndk);
  event.kind = 4; // NIP-04 encrypted DM
  event.tags = [['p', recipientPubkey]];

  // NDK handles encryption when kind=4 and signer is available
  event.content = content;

  try {
    await event.encrypt(undefined, ndk.signer);
    await event.publish();
    return event;
  } catch (err) {
    console.error('Failed to send DM:', err);
    return null;
  }
}

/**
 * Subscribe to incoming DMs for the current user.
 * Returns the subscription so it can be stopped.
 */
export function subscribeDMs(
  myPubkey: string,
  onMessage: (msg: DMMessage) => void,
): NDKSubscription | null {
  const ndk = getNDK();
  if (!ndk.signer) return null;

  const filter: NDKFilter = {
    kinds: [4],
    '#p': [myPubkey],
    since: Math.floor(Date.now() / 1000) - 86400, // last 24h
  };

  const sub = ndk.subscribe(filter, { closeOnEose: false });

  sub.on('event', async (event: NDKEvent) => {
    try {
      await event.decrypt(undefined, ndk.signer!);
      onMessage({
        id: event.id,
        senderPubkey: event.pubkey,
        recipientPubkey: myPubkey,
        content: event.content,
        createdAt: event.created_at || Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.error('Failed to decrypt DM:', err);
    }
  });

  return sub;
}

/**
 * Fetch DM history with a specific user.
 */
export async function fetchDMHistory(
  myPubkey: string,
  otherPubkey: string,
  limit = 50,
): Promise<DMMessage[]> {
  const ndk = getNDK();
  if (!ndk.signer) return [];

  // Fetch messages in both directions
  const filters: NDKFilter[] = [
    { kinds: [4], authors: [myPubkey], '#p': [otherPubkey], limit },
    { kinds: [4], authors: [otherPubkey], '#p': [myPubkey], limit },
  ];

  const messages: DMMessage[] = [];

  for (const filter of filters) {
    try {
      const events = await ndk.fetchEvents(filter);
      for (const event of events) {
        try {
          await event.decrypt(undefined, ndk.signer!);
          const recipientTag = event.tags.find(t => t[0] === 'p');
          messages.push({
            id: event.id,
            senderPubkey: event.pubkey,
            recipientPubkey: recipientTag?.[1] || '',
            content: event.content,
            createdAt: event.created_at || 0,
          });
        } catch {
          // Skip messages we can't decrypt
        }
      }
    } catch {
      // Silently fail
    }
  }

  return messages.sort((a, b) => a.createdAt - b.createdAt);
}
