import type { Event as NostrEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import type { NostrSigner } from '@nostr-wot/signers';
import { subscribeReplaceable, subscribeStream } from '@/lib/nostr-resource';
import { verifyDMEvent } from './pool';
import { getCursors, setCursor, putEvent, getEvent, type CachedDMEvent } from './dm-cache';
import { getRelays } from './relay-list-cache';
import { ingestKind3 } from './follows';

const KIND_NIP04 = 4;
const KIND_GIFT_WRAP = 1059;
const KIND_FOLLOW = 3;

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
  if (!verifyDMEvent(event)) {
    if (typeof window !== 'undefined') console.warn('[dm-ingest] rejected event', { id: event.id, kind: event.kind, pubkey: event.pubkey?.slice(0, 8) });
    return false;
  }
  if (getEvent(myPubkey, event.id)) return true; // dedup
  if (typeof window !== 'undefined') console.log('[dm-ingest] cached event', { id: event.id.slice(0, 8), kind: event.kind, from: event.pubkey?.slice(0, 8), at: event.created_at });
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

function partnerRelaySet(myPubkey: string, partnerPubkey: string, extra: string[] = []): string[] {
  const partnerRelays = getRelays(myPubkey, partnerPubkey).result;
  const relays = Array.from(new Set([
    ...extra,
    ...partnerRelays.readRelays,
    ...partnerRelays.writeRelays,
    ...partnerRelays.inbox,
  ]));
  return relays.length ? relays : ['wss://relay.damus.io', 'wss://nos.lol'];
}

// Per-thread initial open: fetch the latest 50 events. Older messages
// stream in via the top sentinel in DMChat which calls `loadOlder()` on
// scroll-up. We don't use a date `since` window because thread depth
// varies wildly — a chatty thread has 50 messages in a day, a quiet one
// in 2 years. Limit-based pagination is the right primitive.
const INITIAL_THREAD_LIMIT = 50;

/** Open a fire-and-forget DM event stream into the local cache. All four
 *  DM stream fetchers (history, older, inbox window, live tail) share this
 *  exact contract: verify-then-ingest, no replay (consumers read the cache
 *  directly via `getCachedEvents` + `subscribeToCacheTick`). Centralizing
 *  the wiring through `subscribeStream` keeps the dedup / accept / persist
 *  semantics consistent with the rest of the app. */
function streamDMs(myPubkey: string, filters: Filter[], relays: string[]): () => void {
  return subscribeStream({
    filters,
    relays,
    hydrate: () => [], // ingestion-only: cache is read by consumers via dm-cache
    accept: (event) => verifyDMEvent(event),
    persist: (event) => {
      // verifyAndIngest dedupes by id internally and updates cursors —
      // delegating preserves the existing kind→cursor wiring.
      verifyAndIngest(myPubkey, event);
    },
  });
}

export function loadHistory(myPubkey: string, partnerPubkey: string, opts: LoadHistoryOptions = {}): void {
  const cursors = getCursors(myPubkey);
  const nowSec = Math.floor(Date.now() / 1000);
  const limit = INITIAL_THREAD_LIMIT;
  // First open: fetch newest 50 by limit + until=now. Returning visits use
  // the cursor (since: lastSeen) to grab only the gap.
  const baseFilters = (cursorValue: number) =>
    cursorValue > 0 ? { since: cursorValue } : { until: nowSec, limit };
  const filters: Filter[] = [
    { kinds: [KIND_NIP04], authors: [myPubkey], '#p': [partnerPubkey], ...baseFilters(cursors.nip04Out) },
    { kinds: [KIND_NIP04], authors: [partnerPubkey], '#p': [myPubkey], ...baseFilters(cursors.nip04In) },
    { kinds: [KIND_GIFT_WRAP], '#p': [myPubkey], ...baseFilters(cursors.nip17Wrap) },
  ];
  streamDMs(myPubkey, filters, partnerRelaySet(myPubkey, partnerPubkey, opts.relays));
}

/**
 * Fetch the user's published kind 10050 (NIP-17 inbox relays). Other Nostr
 * clients sending us gift-wrapped DMs look up THIS event to know where to
 * deliver our wraps. If we don't query the user's preferred inbox relays,
 * historical wraps published by other clients (Amethyst, Primal, etc.)
 * never reach us — the inbox stays empty regardless of how many wraps
 * are in flight.
 *
 * Resolves with the deduplicated set of relay URLs from the latest
 * 10050 event seen across the wide-net query. Falls back to an empty
 * array if no 10050 exists (caller defaults to Obelisk's relay set).
 */
// Cold-connect time on a fresh page load can be 2-4s for relays the
// SimplePool hasn't opened yet (TLS handshake + WebSocket upgrade + initial
// REQ + EOSE). 3s leaves no headroom — bumped to 8s so the first refresh
// after a deploy actually surfaces the relay-list events. Subsequent calls
// are cheap because the SimplePool reuses the warm sockets.
const RELAY_LIST_FETCH_TIMEOUT_MS = 8000;

type RelayListEntry = { event: NostrEvent; relays: string[] };

/** Promise-shaped wrapper around `subscribeReplaceable` for one-shot relay-
 *  list lookups: the user's own kind-10050 (NIP-17 inbox) or kind-10002
 *  (NIP-65). Resolves with whatever the freshest event seen across the
 *  search net contained — empty array if none arrived inside the
 *  RELAY_LIST_FETCH_TIMEOUT_MS window. Built on the generic primitive so
 *  dedup-by-created_at and the cache contract are uniform with the rest of
 *  the resource layer; we just don't persist (caller already merges the
 *  result into the live walker's relay set). */
function fetchOwnRelayList(args: {
  pubkey: string;
  kind: 10050 | 10002;
  searchRelays: string[];
  parseTags: (tags: string[][]) => string[];
}): Promise<string[]> {
  let newest: RelayListEntry | null = null;
  return new Promise((resolve) => {
    const dispose = subscribeReplaceable<RelayListEntry>({
      filters: [{ kinds: [args.kind], authors: [args.pubkey], limit: 1 }],
      relays: args.searchRelays,
      hydrate: () => null, // one-shot: no cache layer for own-relay lookups
      persist: (entry) => { newest = entry; },
      parse: (event) => ({
        event,
        relays: args.parseTags(event.tags as string[][]),
      }),
      match: (event) => event.kind === args.kind && event.pubkey === args.pubkey,
    });
    setTimeout(() => {
      dispose();
      resolve(newest ? Array.from(new Set((newest as RelayListEntry).relays)) : []);
    }, RELAY_LIST_FETCH_TIMEOUT_MS);
  });
}

export function fetchMyInboxRelays(opts: {
  myPubkey: string;
  /** Wide-net relays to look for the 10050 event. Pool relays + a couple
   *  well-known aggregators. */
  searchRelays: string[];
}): Promise<string[]> {
  return fetchOwnRelayList({
    pubkey: opts.myPubkey,
    kind: 10050,
    searchRelays: opts.searchRelays,
    // Tag shape: ['relay', 'wss://...'] OR ['r', 'wss://...'] (clients vary).
    parseTags: (tags) =>
      tags
        .filter((t) => (t[0] === 'relay' || t[0] === 'r') && typeof t[1] === 'string' && t[1].startsWith('wss://'))
        .map((t) => t[1]),
  });
}

/**
 * Fetch the user's NIP-65 (kind 10002) read + write relays.
 *
 * NIP-04 DMs predate NIP-17 and are NOT delivered to the kind 10050 inbox.
 * Other clients (Damus, Amethyst, Coracle, Primal…) publish them to the
 * sender's NIP-65 write relays, with the recipient's pubkey in a `p` tag.
 * The recipient finds them by querying their own NIP-65 read relays.
 *
 * Without this, a user with NIP-65 relays on (say) `wss://relay.snort.social`
 * and `wss://nos.lol` who signs in to Obelisk sees an empty DM history,
 * because Obelisk's default pool doesn't intersect with where their messages
 * actually live. Returns the union of read+write so the walker queries every
 * relay that could plausibly hold a DM addressed to them.
 */
export function fetchMyDmRelays(opts: {
  myPubkey: string;
  searchRelays: string[];
}): Promise<string[]> {
  return fetchOwnRelayList({
    pubkey: opts.myPubkey,
    kind: 10002,
    searchRelays: opts.searchRelays,
    // NIP-65 tag shape: ['r', '<url>', '<read'|'write'>?]. Missing marker
    // means both. Take everything — for DM coverage we want the union.
    parseTags: (tags) =>
      tags
        .filter((t) => t[0] === 'r' && typeof t[1] === 'string' && t[1].startsWith('wss://'))
        .map((t) => t[1]),
  });
}

/**
 * Inbox window walker. One-shot fetch for events in (until - windowSec, until].
 * Used by useDMLifecycle to extend the partner-discovery window backwards
 * until the user has seen N partners or the relay returns nothing more.
 *
 * Resolves once the relay's EOSE-equivalent fires (or 4s timeout).
 */
export function loadInboxWindow(opts: {
  myPubkey: string;
  myInboxRelays: string[];
  until: number;     // unix seconds — fetch events strictly older than this
  limit?: number;    // per-filter cap, default 200
}): Promise<void> {
  const limit = opts.limit ?? 200;
  const filters: Filter[] = [
    { kinds: [KIND_NIP04], '#p': [opts.myPubkey], until: opts.until, limit },
    { kinds: [KIND_NIP04], authors: [opts.myPubkey], until: opts.until, limit },
    { kinds: [KIND_GIFT_WRAP], '#p': [opts.myPubkey], until: opts.until, limit },
  ];
  return new Promise((resolve) => {
    const close = streamDMs(opts.myPubkey, filters, opts.myInboxRelays);
    // Best-effort close: relays usually settle within ~2s, but some are
    // slow. 4s is a generous upper bound that matches the dev console
    // observation. After this we resolve so the caller can decide whether
    // to extend the window further.
    setTimeout(() => { close(); resolve(); }, 4000);
  });
}

export interface DiscoveredNip17Partner {
  partner: string;
  lastMessageAt: number;
}

/**
 * Bounded NIP-17 partner discovery. Walks the gift-wrap kind:1059 events in
 * the local cache (newest-first), decrypts up to `limit` wraps that don't
 * already have a cached secret envelope, writes the secrets back so the
 * thread view doesn't re-prompt the signer.
 *
 * Returns one entry per discovered partner with the timestamp of the most
 * recent wrap that mentioned them. Bounded to keep first-login signer-prompt
 * count manageable on extensions like Alby that prompt per-call (each unwrap
 * = 2 NIP-44 decrypts).
 */
export async function discoverNip17Partners(opts: {
  myPubkey: string;
  signer: unknown;         // NostrSigner
  cacheKey: CryptoKey;
  limit?: number;          // newest-N undecrypted wraps to crack open
}): Promise<DiscoveredNip17Partner[]> {
  const limit = opts.limit ?? 30;
  const { getCachedEvents, getSecret, putSecret } = await import('./dm-cache');
  const { unwrapGiftWrap } = await import('@nostr-wot/dm');
  const signer = opts.signer as import('@nostr-wot/signers').NostrSigner;

  // Newest-first walk. We want the most recent N wraps so the inbox
  // surfaces active conversations before exhausting the prompt budget.
  const wraps = getCachedEvents(opts.myPubkey)
    .filter((ev) => ev.kind === 1059)
    .sort((a, b) => b.created_at - a.created_at);

  const partnersMap = new Map<string, number>();
  let prompts = 0;

  for (const ev of wraps) {
    // Fast path: secret already cached → read partner from envelope.
    const cached = await getSecret(opts.myPubkey, opts.cacheKey, ev.id);
    if (cached) {
      try {
        const env = JSON.parse(cached) as { senderPubkey: string; recipientPubkey: string; createdAt: number };
        // Partner is whichever party isn't us.
        const partner = env.senderPubkey === opts.myPubkey ? env.recipientPubkey : env.senderPubkey;
        if (!partner) continue;
        const prev = partnersMap.get(partner) ?? 0;
        if (env.createdAt > prev) partnersMap.set(partner, env.createdAt);
      } catch { /* corrupt envelope → re-decrypt below */ }
      continue;
    }

    // Slow path: decrypt this wrap. Counts against the prompt budget.
    if (prompts >= limit) continue;
    prompts++;

    try {
      const wrap: NostrEvent = {
        id: ev.id,
        pubkey: ev.pubkey,
        kind: 1059,
        content: ev.content,
        tags: ev.tags,
        created_at: ev.created_at,
        sig: ev.sig ?? '',
      };
      const { message: rumor, senderPubkey } = await unwrapGiftWrap(signer, wrap);
      if (rumor.kind !== 14) continue;
      const recipientTag = (rumor.tags as string[][]).find((t) => t[0] === 'p');
      const recipientPubkey = recipientTag?.[1] ?? '';
      const env = {
        senderPubkey,
        recipientPubkey,
        content: rumor.content,
        createdAt: rumor.created_at ?? ev.created_at,
        protocol: 'nip17' as const,
      };
      await putSecret(opts.myPubkey, opts.cacheKey, ev.id, JSON.stringify(env));
      const partner = env.senderPubkey === opts.myPubkey ? env.recipientPubkey : env.senderPubkey;
      if (!partner) continue;
      const prev = partnersMap.get(partner) ?? 0;
      if (env.createdAt > prev) partnersMap.set(partner, env.createdAt);
    } catch {
      // unwrapGiftWrap throws on signer errors / bad payload; skip and continue.
      continue;
    }
  }

  return Array.from(partnersMap.entries())
    .map(([partner, lastMessageAt]) => ({ partner, lastMessageAt }))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export interface LoadOlderOptions {
  /** Fetch events strictly older than this unix timestamp (seconds). */
  before: number;
  /** Per-filter limit on the relay REQ. Default 50. */
  limit?: number;
  /** Extra relays to query alongside the partner's outbox/inbox. */
  relays?: string[];
}

/**
 * One-shot fetch for older history. Uses `until` + `limit` against the same
 * relay set as `loadHistory`. Events flow through `verifyAndIngest` and land
 * in the cache; consumers observe them by re-reading the cache (the live sub
 * uses `since` cursors, so it does NOT redeliver these). Returns a closer
 * the caller can invoke to abort early.
 */
export function loadOlder(myPubkey: string, partnerPubkey: string, opts: LoadOlderOptions): () => void {
  const limit = opts.limit ?? 50;
  const filters: Filter[] = [
    { kinds: [KIND_NIP04], authors: [myPubkey], '#p': [partnerPubkey], until: opts.before, limit },
    { kinds: [KIND_NIP04], authors: [partnerPubkey], '#p': [myPubkey], until: opts.before, limit },
    { kinds: [KIND_GIFT_WRAP], '#p': [myPubkey], until: opts.before, limit },
  ];
  return streamDMs(myPubkey, filters, partnerRelaySet(myPubkey, partnerPubkey, opts.relays));
}

export interface SubscribeLiveOptions {
  myPubkey: string;
  myInboxRelays: string[];
  onEvent?: (event: NostrEvent) => void;
}

export function subscribeLive(opts: SubscribeLiveOptions): () => void {
  const cursors = getCursors(opts.myPubkey);
  const nowSec = Math.floor(Date.now() / 1000);
  // Live-tail only. Historical fetch is the caller's job:
  //   - inbox: useDMLifecycle calls loadInboxWindow() in a loop until N
  //     partners discovered (or no more events).
  //   - per-thread: DMSessionProvider's loadThread() calls loadHistory()
  //     for the latest 50 messages on first open.
  // After the first historical hydrate the cursor is set, so subsequent
  // logins resume from `cursors.X` (gap-fill).
  const filters: Filter[] = [
    { kinds: [KIND_NIP04], '#p': [opts.myPubkey], since: cursors.nip04In > 0 ? cursors.nip04In : nowSec },
    { kinds: [KIND_NIP04], authors: [opts.myPubkey], since: cursors.nip04Out > 0 ? cursors.nip04Out : nowSec },
    { kinds: [KIND_GIFT_WRAP], '#p': [opts.myPubkey], since: cursors.nip17Wrap > 0 ? cursors.nip17Wrap : nowSec },
    // Follow-list (kind 3): small payload, no bound — let the relay deliver
    // whatever it has on first call.
    { kinds: [KIND_FOLLOW], authors: [opts.myPubkey], ...(cursors.kind3 > 0 ? { since: cursors.kind3 } : {}) },
  ];
  // Built on `subscribeStream` so the contract matches every other
  // event-stream consumer in the app (zaps, DM history, inbox windows).
  // The teardown returned closes the underlying SimplePool sub so events
  // stop flowing on the wire when the caller disposes.
  return subscribeStream({
    filters,
    relays: opts.myInboxRelays,
    hydrate: () => [], // live tail: no replay (cursor-bounded `since` filter)
    accept: (event) => verifyDMEvent(event),
    persist: (event) => {
      verifyAndIngest(opts.myPubkey, event);
      opts.onEvent?.(event);
    },
  });
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
  signer: NostrSigner;
  myRelays: string[];
}

export async function sendDM(args: SendDMArgs): Promise<NostrEvent> {
  const { buildChatMessage, sealAndGiftWrap } = await import('@nostr-wot/dm');
  const { signer } = args;

  const partnerRelays = getRelays(args.myPubkey, args.recipientPubkey).result;
  const targetRelays =
    args.protocol === 'nip17'
      ? partnerRelays.inbox
      : partnerRelays.readRelays;

  if (args.protocol === 'nip04') {
    if (!signer.nip04Encrypt) throw new Error('Signer does not support NIP-04');
    const ciphertext = await signer.nip04Encrypt(args.recipientPubkey, args.content);
    const template = {
      kind: KIND_NIP04,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', args.recipientPubkey]] as string[][],
      content: ciphertext,
    };
    const event = await signer.signEvent(template);
    await publishToRelays(event, targetRelays);
    putEvent(args.myPubkey, toCached(event));
    setCursor(args.myPubkey, 'nip04Out', event.created_at);
    return event;
  }

  // NIP-17: build inner kind-14 message (unsigned), then seal+gift-wrap
  // twice — once for recipient, once for self. Both wraps share the same
  // inner rumor id/created_at so the recipient and the sender's own
  // self-wrap converge to the same logical message in any client.
  const rumor = buildChatMessage(args.myPubkey, args.recipientPubkey, args.content);
  const wrapForRecipient = await sealAndGiftWrap(signer, args.recipientPubkey, rumor);
  const wrapForSelf = await sealAndGiftWrap(signer, args.myPubkey, rumor);

  // Publish both. Recipient-wrap goes to the recipient's inbox (already
  // computed in `targetRelays`); self-wrap goes to the user's own pool
  // relays so it persists somewhere and replays on next session. Failures
  // are non-fatal — the local cache write below guarantees the message
  // shows up immediately even if the publish hasn't completed.
  await publishToRelays(wrapForRecipient, targetRelays);
  const myPoolRelays = args.myRelays;
  await publishToRelays(wrapForSelf, myPoolRelays).catch((err) => {
    console.warn('[dm-send] self-wrap publish failed (cache fallback in effect):', err);
  });

  putEvent(args.myPubkey, toCached(wrapForSelf));
  setCursor(args.myPubkey, 'nip17Wrap', wrapForSelf.created_at);
  return wrapForSelf;
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

async function publishToRelays(event: NostrEvent, relays: string[]): Promise<void> {
  const { getPool } = await import('@nostr-wot/data');
  const pool = getPool();
  // Empty relay set is a no-op publish — caller relies on local cache.
  // Otherwise fan out via the shared pool; allSettled keeps a single
  // dead relay from torpedoing the whole publish.
  if (relays.length === 0) return;
  await Promise.allSettled(pool.publish(relays, event));
}
