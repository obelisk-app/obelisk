import type { Event as NostrEvent, Filter } from 'nostr-tools/pure';
import { RequestCoalescer } from './coalescer';
import { verifyDMEvent } from './pool';
import { getCursors, setCursor, putEvent, getEvent, type CachedDMEvent } from './dm-cache';
import { getRelays } from './relay-list-cache';
import { ingestKind3 } from './follows';

const KIND_NIP04 = 4;
const KIND_RUMOR = 14;
const KIND_GIFT_WRAP = 1059;
const KIND_FOLLOW = 3;

const coalescer = new RequestCoalescer({ debounceMs: 50 });

function toCached(event: NostrEvent): CachedDMEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    created_at: event.created_at,
    content: event.content,
    tags: event.tags as string[][],
    sig: event.sig,
  };
}

export function verifyAndIngest(myPubkey: string, event: NostrEvent): boolean {
  if (!verifyDMEvent(event)) return false;
  if (getEvent(myPubkey, event.id)) return true; // dedup
  putEvent(myPubkey, toCached(event));
  if (event.kind === KIND_NIP04) {
    if (event.pubkey === myPubkey) setCursor(myPubkey, 'nip04Out', event.created_at);
    else setCursor(myPubkey, 'nip04In', event.created_at);
  } else if (event.kind === KIND_GIFT_WRAP) {
    setCursor(myPubkey, 'nip17Wrap', event.created_at);
  } else if (event.kind === KIND_FOLLOW && event.pubkey === myPubkey) {
    ingestKind3(myPubkey, event);
    setCursor(myPubkey, 'kind3', event.created_at);
  }
  return true;
}

export interface LoadHistoryOptions {
  relays?: string[];
}

export function loadHistory(myPubkey: string, partnerPubkey: string, opts: LoadHistoryOptions = {}): void {
  const cursors = getCursors(myPubkey);
  const partnerRelays = getRelays(myPubkey, partnerPubkey).result;
  const relays = Array.from(new Set([
    ...(opts.relays ?? []),
    ...partnerRelays.readRelays,
    ...partnerRelays.writeRelays,
    ...partnerRelays.inbox,
  ]));

  const filters: Filter[] = [
    { kinds: [KIND_NIP04], authors: [myPubkey], '#p': [partnerPubkey], ...(cursors.nip04Out > 0 ? { since: cursors.nip04Out } : {}) },
    { kinds: [KIND_NIP04], authors: [partnerPubkey], '#p': [myPubkey], ...(cursors.nip04In > 0 ? { since: cursors.nip04In } : {}) },
    { kinds: [KIND_GIFT_WRAP], '#p': [myPubkey], ...(cursors.nip17Wrap > 0 ? { since: cursors.nip17Wrap } : {}) },
  ];

  coalescer.enqueue({
    filters,
    relays: relays.length ? relays : ['wss://relay.damus.io', 'wss://nos.lol'],
    onEvent: (event) => verifyAndIngest(myPubkey, event),
  });
}

export interface SubscribeLiveOptions {
  myPubkey: string;
  myInboxRelays: string[];
  onEvent?: (event: NostrEvent) => void;
}

export function subscribeLive(opts: SubscribeLiveOptions): () => void {
  const cursors = getCursors(opts.myPubkey);
  let cancelled = false;
  const filters: Filter[] = [
    { kinds: [KIND_NIP04], '#p': [opts.myPubkey], ...(cursors.nip04In > 0 ? { since: cursors.nip04In } : {}) },
    { kinds: [KIND_NIP04], authors: [opts.myPubkey], ...(cursors.nip04Out > 0 ? { since: cursors.nip04Out } : {}) },
    { kinds: [KIND_GIFT_WRAP], '#p': [opts.myPubkey], ...(cursors.nip17Wrap > 0 ? { since: cursors.nip17Wrap } : {}) },
    { kinds: [KIND_FOLLOW], authors: [opts.myPubkey], ...(cursors.kind3 > 0 ? { since: cursors.kind3 } : {}) },
  ];
  coalescer.enqueue({
    filters,
    relays: opts.myInboxRelays,
    onEvent: (event) => {
      if (cancelled) return;
      const ok = verifyAndIngest(opts.myPubkey, event);
      if (ok) opts.onEvent?.(event);
    },
  });
  return () => { cancelled = true; };
}

export type DMProtocol = 'nip04' | 'nip17';

/**
 * In-memory shape used by the UI / store. Plaintext lives only in RAM —
 * see DMCache for the encrypted-at-rest representation.
 */
export interface DMMessage {
  id: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  createdAt: number; // unix timestamp (seconds)
  protocol: DMProtocol;
  /** Optimistic-send state — true while the event is still publishing. */
  isPending?: boolean;
  /** Populated when publish fails; presence of this field enables the retry UI. */
  sendError?: string;
}

export interface SendDMArgs {
  myPubkey: string;
  recipientPubkey: string;
  content: string;
  protocol: DMProtocol;
}

export async function sendDM(args: SendDMArgs): Promise<NostrEvent> {
  const { getNDK } = await import('@/lib/nostr');
  const ndk = getNDK();
  if (!ndk.signer) throw new Error('No signer');

  const { NDKEvent: NDKEventClass, NDKUser } = await import('@nostr-dev-kit/ndk');
  const recipient = new NDKUser({ pubkey: args.recipientPubkey });
  recipient.ndk = ndk;

  const partnerRelays = getRelays(args.myPubkey, args.recipientPubkey).result;
  const targetRelays =
    args.protocol === 'nip17'
      ? partnerRelays.inbox
      : partnerRelays.readRelays;

  if (args.protocol === 'nip04') {
    const ev = new NDKEventClass(ndk);
    ev.kind = KIND_NIP04;
    ev.tags = [['p', args.recipientPubkey]];
    ev.content = args.content;
    await ev.encrypt(recipient, ndk.signer, 'nip04');
    await publishToRelays(ndk, ev, targetRelays);
    const raw = ev.rawEvent() as NostrEvent;
    putEvent(args.myPubkey, toCached(raw));
    setCursor(args.myPubkey, 'nip04Out', raw.created_at);
    return raw;
  }

  const { giftWrap } = await import('@nostr-dev-kit/ndk');
  const rumor = new NDKEventClass(ndk);
  rumor.kind = KIND_RUMOR;
  rumor.content = args.content;
  rumor.tags = [['p', args.recipientPubkey]];
  const wrap = await giftWrap(rumor, recipient, ndk.signer);
  await publishToRelays(ndk, wrap, targetRelays);
  const rawWrap = wrap.rawEvent() as NostrEvent;
  putEvent(args.myPubkey, toCached(rawWrap));
  setCursor(args.myPubkey, 'nip17Wrap', rawWrap.created_at);
  return rawWrap;
}

/**
 * Detect whether the recent slice of a thread is using NIP-04. Used by
 * DMChat to surface a "this conversation is on legacy NIP-04 — switch to
 * private NIP-17?" prompt to the user.
 *
 * Pure function over an in-memory list — no cache, no relays.
 */
export function detectNip04InRecent(messages: DMMessage[], count = 10): boolean {
  const recent = messages.slice(-count);
  return recent.some((m) => m.protocol === 'nip04');
}

async function publishToRelays(ndk: any, event: any, relays: string[]): Promise<void> {
  if (relays.length === 0) {
    await event.publish();
    return;
  }
  const { NDKRelaySet } = await import('@nostr-dev-kit/ndk');
  const set = NDKRelaySet.fromRelayUrls(relays, ndk);
  await event.publish(set);
}
