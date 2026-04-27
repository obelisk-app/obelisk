/**
 * Browser-side Nostr read helpers built on the shared request coalescer.
 *
 * Replaces the `ndk.fetchEvent` / `ndk.fetchEvents` paths in non-DM consumers
 * (profiles, follows, follower lists, user notes, debug tools). NDK is still
 * used for everything that needs a signer — login, signing, encrypting,
 * publishing — but read-path traffic now flows through `sharedCoalescer`
 * so calls from different modules within a 50ms window are merged into a
 * single REQ per relay-set.
 *
 * All helpers verify signatures before surfacing events. Time-bounded so the
 * UI never blocks on a slow relay.
 */

import type { Event as NostrEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import { sharedCoalescer } from './nostr-coalescer';

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://purplepag.es',
  'wss://nostr.wine',
];

const DEFAULT_TIMEOUT_MS = 8000;

interface QueryOptions {
  relays?: string[];
  timeoutMs?: number;
}

/**
 * Promise-shaped query that flows through `sharedCoalescer.querySync`. The
 * coalescer batches our filters with any other concurrent enqueues sharing
 * the same relay-set within the debounce window, fires one `subscribeMany`,
 * and resolves with the verified events. Sig verification is enforced by
 * the coalescer itself.
 */
async function querySigned(filters: Filter[], opts: QueryOptions = {}): Promise<NostrEvent[]> {
  const relays = opts.relays && opts.relays.length > 0 ? opts.relays : DEFAULT_RELAYS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    return await sharedCoalescer.querySync(filters, { relays, timeoutMs });
  } catch (err) {
    console.warn('[nostr-read] querySync failed:', err);
    return [];
  }
}

/**
 * Fetch the latest kind 0 (profile metadata) for `pubkey`. Returns the parsed
 * `content` JSON or `{}` if no event was found / parseable.
 */
export async function fetchKind0(pubkey: string, opts: QueryOptions = {}): Promise<Record<string, unknown>> {
  const events = await querySigned([{ kinds: [0], authors: [pubkey], limit: 1 }], opts);
  let newest: NostrEvent | null = null;
  for (const ev of events) {
    if (!newest || ev.created_at > newest.created_at) newest = ev;
  }
  if (!newest) return {};
  try {
    return JSON.parse(newest.content);
  } catch {
    return {};
  }
}

/**
 * Fetch a single event by id. Returns null if no relay produced it within
 * the timeout, or if signature verification failed.
 */
export async function fetchEventById(id: string, opts: QueryOptions = {}): Promise<NostrEvent | null> {
  const events = await querySigned([{ ids: [id], limit: 1 }], opts);
  return events[0] ?? null;
}

/**
 * Pubkeys that follow `pubkey`, derived from kind 3 events whose `p` tag
 * targets them.
 */
export async function fetchFollowers(pubkey: string, opts: QueryOptions = {}): Promise<string[]> {
  const events = await querySigned([{ kinds: [3], '#p': [pubkey] }], opts);
  const out = new Set<string>();
  for (const ev of events) out.add(ev.pubkey);
  return Array.from(out);
}

/**
 * Pubkeys followed by `pubkey`, derived from the latest kind 3 event
 * authored by them.
 */
export async function fetchFollowing(pubkey: string, opts: QueryOptions = {}): Promise<string[]> {
  const events = await querySigned([{ kinds: [3], authors: [pubkey], limit: 1 }], opts);
  let newest: NostrEvent | null = null;
  for (const ev of events) {
    if (!newest || ev.created_at > newest.created_at) newest = ev;
  }
  if (!newest) return [];
  const out = new Set<string>();
  for (const tag of newest.tags) {
    if (tag[0] === 'p' && typeof tag[1] === 'string' && /^[0-9a-f]{64}$/i.test(tag[1])) {
      out.add(tag[1].toLowerCase());
    }
  }
  return Array.from(out);
}

/**
 * Most recent kind 1 notes authored by `pubkey`, newest-first.
 */
export async function fetchUserNotes(
  pubkey: string,
  limit = 20,
  opts: QueryOptions = {},
): Promise<NostrEvent[]> {
  const events = await querySigned([{ kinds: [1], authors: [pubkey], limit }], opts);
  return events.sort((a, b) => b.created_at - a.created_at);
}

/**
 * Parse a kind 10002 (NIP-65 relay-list metadata) event into the read/write
 * URL split. Markers: untagged `r` URLs are both read and write; explicit
 * `read` / `write` markers narrow the membership.
 */
export function parseRelayListMeta(event: NostrEvent): { read: string[]; write: string[] } {
  const read = new Set<string>();
  const write = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue;
    const url = tag[1];
    const marker = tag[2];
    if (!marker || marker === 'read') read.add(url);
    if (!marker || marker === 'write') write.add(url);
  }
  return { read: Array.from(read), write: Array.from(write) };
}

/**
 * Parse a kind 10050 (NIP-17 DM inbox relays) event into the URL list.
 * Accepts both `relay` and `r` tag names for compatibility with clients
 * that publish either form.
 */
export function parseInboxRelays(event: NostrEvent): string[] {
  const out = new Set<string>();
  for (const tag of event.tags) {
    if ((tag[0] === 'relay' || tag[0] === 'r') && typeof tag[1] === 'string' && tag[1].startsWith('wss://')) {
      out.add(tag[1]);
    }
  }
  return Array.from(out);
}

/**
 * Fetch the kind 10002 (NIP-65 relay list metadata) for `pubkey` and return
 * the relay URLs declared as readable / writeable. Used by the legacy
 * `addUserRelays` path; new code should prefer the per-account
 * `relay-list-cache` SWR layer.
 */
export async function fetchRelayList(pubkey: string, opts: QueryOptions = {}): Promise<{
  read: string[];
  write: string[];
}> {
  const events = await querySigned([{ kinds: [10002], authors: [pubkey], limit: 1 }], opts);
  let newest: NostrEvent | null = null;
  for (const ev of events) {
    if (!newest || ev.created_at > newest.created_at) newest = ev;
  }
  if (!newest) return { read: [], write: [] };
  return parseRelayListMeta(newest);
}
