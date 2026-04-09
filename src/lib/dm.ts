import { getNDK } from './nostr';
import type { NDKEvent, NDKSubscription, NDKFilter } from '@nostr-dev-kit/ndk';
import { NDKUser } from '@nostr-dev-kit/ndk';

export type DMProtocol = 'nip04' | 'nip17';

export interface DMMessage {
  id: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  createdAt: number; // unix timestamp
  protocol: DMProtocol;
}

/**
 * Sort participant pubkeys to create a canonical thread key.
 */
export function threadKey(pubkey1: string, pubkey2: string): [string, string] {
  return pubkey1 < pubkey2 ? [pubkey1, pubkey2] : [pubkey2, pubkey1];
}

/**
 * Send an encrypted DM using NIP-04 (kind 4).
 */
export async function sendNip04DM(recipientPubkey: string, content: string): Promise<NDKEvent | null> {
  const ndk = getNDK();
  if (!ndk.signer) return null;

  const recipient = new NDKUser({ pubkey: recipientPubkey });
  recipient.ndk = ndk;

  const { NDKEvent: NDKEventClass } = await import('@nostr-dev-kit/ndk');
  const event = new NDKEventClass(ndk);
  event.kind = 4;
  event.tags = [['p', recipientPubkey]];
  event.content = content;

  try {
    await event.encrypt(recipient, ndk.signer, 'nip04');
    await event.publish();
    return event;
  } catch (err) {
    console.error('Failed to send NIP-04 DM:', err);
    return null;
  }
}

/**
 * Send an encrypted DM using NIP-17 (gift-wrapped kind 14).
 */
export async function sendNip17DM(recipientPubkey: string, content: string): Promise<NDKEvent | null> {
  const ndk = getNDK();
  if (!ndk.signer) return null;

  const recipient = new NDKUser({ pubkey: recipientPubkey });
  recipient.ndk = ndk;

  const { NDKEvent: NDKEventClass } = await import('@nostr-dev-kit/ndk');
  const { giftWrap } = await import('@nostr-dev-kit/ndk');

  // Create the rumor (kind 14 - NIP-17 private direct message)
  const rumor = new NDKEventClass(ndk);
  rumor.kind = 14;
  rumor.content = content;
  rumor.tags = [['p', recipientPubkey]];

  try {
    const wrapped = await giftWrap(rumor, recipient, ndk.signer);
    await wrapped.publish();
    return rumor;
  } catch (err) {
    console.error('Failed to send NIP-17 DM:', err);
    return null;
  }
}

/**
 * Send a DM using the specified protocol.
 */
export async function sendDM(
  recipientPubkey: string,
  content: string,
  protocol: DMProtocol = 'nip17',
): Promise<NDKEvent | null> {
  return protocol === 'nip04'
    ? sendNip04DM(recipientPubkey, content)
    : sendNip17DM(recipientPubkey, content);
}

/**
 * Subscribe to DMs for the current user (both NIP-04 and NIP-17).
 * Returns a cleanup function.
 */
export function subscribeDMs(
  myPubkey: string,
  onMessage: (msg: DMMessage) => void,
): (() => void) | null {
  const ndk = getNDK();
  if (!ndk.signer) return null;

  const seen = new Set<string>();
  const subs: NDKSubscription[] = [];

  // NIP-04: kind 4 (both incoming and outgoing)
  const nip04Filters: NDKFilter[] = [
    { kinds: [4], '#p': [myPubkey] },
    { kinds: [4], authors: [myPubkey] },
  ];

  const nip04Sub = ndk.subscribe(nip04Filters, { closeOnEose: false });
  subs.push(nip04Sub);

  nip04Sub.on('event', async (event: NDKEvent) => {
    if (seen.has(event.id)) return;
    seen.add(event.id);

    try {
      const recipientTag = event.tags.find(t => t[0] === 'p');
      const recipientPubkey = recipientTag?.[1] || '';
      const otherPubkey = event.pubkey === myPubkey ? recipientPubkey : event.pubkey;
      if (!otherPubkey) return;

      const otherUser = new NDKUser({ pubkey: otherPubkey });
      otherUser.ndk = ndk;

      await event.decrypt(otherUser, ndk.signer!, 'nip04');
      onMessage({
        id: event.id,
        senderPubkey: event.pubkey,
        recipientPubkey,
        content: event.content,
        createdAt: event.created_at || Math.floor(Date.now() / 1000),
        protocol: 'nip04',
      });
    } catch (err) {
      console.error('Failed to decrypt NIP-04 DM:', err);
    }
  });

  // NIP-17: kind 1059 gift wraps addressed to me
  const nip17Filter: NDKFilter = {
    kinds: [1059],
    '#p': [myPubkey],
  };

  const nip17Sub = ndk.subscribe(nip17Filter, { closeOnEose: false });
  subs.push(nip17Sub);

  nip17Sub.on('event', async (event: NDKEvent) => {
    if (seen.has(event.id)) return;
    seen.add(event.id);

    try {
      const { giftUnwrap } = await import('@nostr-dev-kit/ndk');
      const rumor = await giftUnwrap(event, undefined, ndk.signer!);

      // Only process kind 14 (private DMs)
      if (rumor.kind !== 14) return;

      const recipientTag = rumor.tags.find(t => t[0] === 'p');
      const recipientPubkey = recipientTag?.[1] || myPubkey;

      onMessage({
        id: rumor.id || event.id,
        senderPubkey: rumor.pubkey,
        recipientPubkey,
        content: rumor.content,
        createdAt: rumor.created_at || Math.floor(Date.now() / 1000),
        protocol: 'nip17',
      });
    } catch {
      // Can't unwrap — not for us or corrupted
    }
  });

  return () => {
    for (const sub of subs) {
      sub.stop();
    }
  };
}

/**
 * Fetch DM history with a specific user (both NIP-04 and NIP-17).
 */
export async function fetchDMHistory(
  myPubkey: string,
  otherPubkey: string,
  limit = 50,
): Promise<DMMessage[]> {
  const ndk = getNDK();
  if (!ndk.signer) return [];

  const otherUser = new NDKUser({ pubkey: otherPubkey });
  otherUser.ndk = ndk;

  const messages: DMMessage[] = [];
  const seen = new Set<string>();

  // NIP-04: kind 4 in both directions
  const nip04Filters: NDKFilter[] = [
    { kinds: [4], authors: [myPubkey], '#p': [otherPubkey], limit },
    { kinds: [4], authors: [otherPubkey], '#p': [myPubkey], limit },
  ];

  for (const filter of nip04Filters) {
    try {
      const events = await ndk.fetchEvents(filter);
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        try {
          await event.decrypt(otherUser, ndk.signer!, 'nip04');
          const recipientTag = event.tags.find(t => t[0] === 'p');
          messages.push({
            id: event.id,
            senderPubkey: event.pubkey,
            recipientPubkey: recipientTag?.[1] || '',
            content: event.content,
            createdAt: event.created_at || 0,
            protocol: 'nip04',
          });
        } catch {
          // Skip undecryptable
        }
      }
    } catch {
      // Relay error
    }
  }

  // NIP-17: kind 1059 gift wraps
  const nip17Filter: NDKFilter = {
    kinds: [1059],
    '#p': [myPubkey],
    limit: limit * 2, // fetch more since not all will be from otherPubkey
  };

  try {
    const { giftUnwrap } = await import('@nostr-dev-kit/ndk');
    const wrapEvents = await ndk.fetchEvents(nip17Filter);
    for (const wrap of wrapEvents) {
      if (seen.has(wrap.id)) continue;
      try {
        const rumor = await giftUnwrap(wrap, undefined, ndk.signer!);
        if (rumor.kind !== 14) continue;

        const recipientTag = rumor.tags.find(t => t[0] === 'p');
        const senderPubkey = rumor.pubkey;
        const recipientPubkey = recipientTag?.[1] || '';

        // Only include messages between us and otherPubkey
        const isRelevant =
          (senderPubkey === otherPubkey && recipientPubkey === myPubkey) ||
          (senderPubkey === myPubkey && recipientPubkey === otherPubkey);
        if (!isRelevant) continue;

        const msgId = rumor.id || wrap.id;
        if (seen.has(msgId)) continue;
        seen.add(msgId);

        messages.push({
          id: msgId,
          senderPubkey,
          recipientPubkey,
          content: rumor.content,
          createdAt: rumor.created_at || 0,
          protocol: 'nip17',
        });
      } catch {
        // Can't unwrap
      }
    }
  } catch {
    // Relay error
  }

  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Detect which protocol a conversation partner uses based on recent messages.
 * Returns true if NIP-04 messages are found in the last 10 messages.
 */
export function detectNip04InRecent(messages: DMMessage[], count = 10): boolean {
  const recent = messages.slice(-count);
  return recent.some(m => m.protocol === 'nip04');
}

/**
 * Discover existing DM threads by fetching recent events (NIP-04 + NIP-17).
 */
export async function discoverDMThreads(
  myPubkey: string,
): Promise<Map<string, { lastMessage: string; lastMessageAt: number; protocol: DMProtocol }>> {
  const ndk = getNDK();
  if (!ndk.signer) return new Map();

  const threads = new Map<string, { lastMessage: string; lastMessageAt: number; protocol: DMProtocol }>();

  // NIP-04 — discover threads without decrypting (avoids NIP-07 popup flood)
  const nip04Filters: NDKFilter[] = [
    { kinds: [4], '#p': [myPubkey], limit: 100 },
    { kinds: [4], authors: [myPubkey], limit: 100 },
  ];

  for (const filter of nip04Filters) {
    try {
      const events = await ndk.fetchEvents(filter);
      for (const event of events) {
        try {
          const recipientTag = event.tags.find(t => t[0] === 'p');
          const recipientPubkey = recipientTag?.[1] || '';
          const otherPubkey = event.pubkey === myPubkey ? recipientPubkey : event.pubkey;
          if (!otherPubkey) continue;

          const ts = event.created_at || 0;
          const existing = threads.get(otherPubkey);
          if (!existing || ts > existing.lastMessageAt) {
            threads.set(otherPubkey, { lastMessage: '', lastMessageAt: ts, protocol: 'nip04' });
          }
        } catch { /* skip */ }
      }
    } catch { /* relay error */ }
  }

  // NIP-17 — gift wraps must be unwrapped to discover the sender,
  // but we limit to a small batch to avoid excessive decrypt prompts
  try {
    const { giftUnwrap } = await import('@nostr-dev-kit/ndk');
    const wrapEvents = await ndk.fetchEvents({
      kinds: [1059],
      '#p': [myPubkey],
      limit: 30,
    });

    for (const wrap of wrapEvents) {
      try {
        const rumor = await giftUnwrap(wrap, undefined, ndk.signer!);
        if (rumor.kind !== 14) continue;

        const recipientTag = rumor.tags.find(t => t[0] === 'p');
        const senderPubkey = rumor.pubkey;
        const recipientPubkey = recipientTag?.[1] || '';
        const otherPubkey = senderPubkey === myPubkey ? recipientPubkey : senderPubkey;
        if (!otherPubkey) continue;

        const ts = rumor.created_at || 0;
        const existing = threads.get(otherPubkey);
        if (!existing || ts > existing.lastMessageAt) {
          threads.set(otherPubkey, { lastMessage: '', lastMessageAt: ts, protocol: 'nip17' });
        }
      } catch { /* skip */ }
    }
  } catch { /* relay error */ }

  return threads;
}
