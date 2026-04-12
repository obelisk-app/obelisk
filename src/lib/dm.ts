import { getNDK } from './nostr';
import type { NDKEvent, NDKSubscription, NDKFilter } from '@nostr-dev-kit/ndk';
import { NDKUser } from '@nostr-dev-kit/ndk';
import {
  enumeratePartners,
  getCachedEvents,
  getLatestForPartner,
  getPlaintext,
  getRumor,
  getSyncState,
  putEvent,
  putPlaintext,
  putRumor,
  setSyncState,
  type CachedDMEvent,
  type CachedRumor,
} from './dm-cache';

export type DMProtocol = 'nip04' | 'nip17';

export interface DMMessage {
  id: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  createdAt: number; // unix timestamp
  protocol: DMProtocol;
  /** Optimistic-send state — true while the event is still publishing. */
  isPending?: boolean;
  /** Populated when publish fails; presence of this field enables the retry UI. */
  sendError?: string;
}

export interface ThreadSummary {
  lastMessage: string;
  lastMessageAt: number;
  protocol: DMProtocol;
}

/** Fresh full-scan at most once per 24h to avoid hammering relays. */
const FULL_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Sort participant pubkeys to create a canonical thread key.
 */
export function threadKey(pubkey1: string, pubkey2: string): [string, string] {
  return pubkey1 < pubkey2 ? [pubkey1, pubkey2] : [pubkey2, pubkey1];
}

/**
 * Convert a raw NDK event into the plain CachedDMEvent shape we persist.
 */
function toCachedEvent(event: NDKEvent): CachedDMEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind as 4 | 1059,
    created_at: event.created_at ?? Math.floor(Date.now() / 1000),
    content: event.content,
    tags: event.tags as string[][],
    sig: event.sig,
  };
}

/**
 * Send an encrypted DM using NIP-04 (kind 4).
 */
export async function sendNip04DM(
  recipientPubkey: string,
  content: string,
  myPubkey?: string,
): Promise<NDKEvent | null> {
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
    if (myPubkey) {
      // Cache the raw encrypted event + the plaintext we just sent so the
      // thread reflects the send instantly on reload.
      putEvent(myPubkey, toCachedEvent(event));
      putPlaintext(myPubkey, event.id, content);
    }
    return event;
  } catch (err) {
    console.error('Failed to send NIP-04 DM:', err);
    return null;
  }
}

/**
 * Send an encrypted DM using NIP-17 (gift-wrapped kind 14).
 */
export async function sendNip17DM(
  recipientPubkey: string,
  content: string,
  myPubkey?: string,
): Promise<NDKEvent | null> {
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
    if (myPubkey && wrapped.id) {
      // Cache the gift wrap + its unwrapped rumor on our side so we don't
      // need to decrypt it again on reload.
      putEvent(myPubkey, toCachedEvent(wrapped));
      putRumor(myPubkey, {
        rumorId: rumor.id ?? wrapped.id,
        wrapId: wrapped.id,
        senderPubkey: myPubkey,
        recipientPubkey,
        content,
        createdAt: rumor.created_at ?? Math.floor(Date.now() / 1000),
      });
    }
    return rumor;
  } catch (err) {
    console.error('Failed to send NIP-17 DM:', err);
    return null;
  }
}

/**
 * Send a DM using the specified protocol. Throws on failure (callers use
 * this for optimistic send + retry UI).
 */
export async function sendDM(
  recipientPubkey: string,
  content: string,
  protocol: DMProtocol = 'nip17',
  myPubkey?: string,
): Promise<NDKEvent> {
  const result =
    protocol === 'nip04'
      ? await sendNip04DM(recipientPubkey, content, myPubkey)
      : await sendNip17DM(recipientPubkey, content, myPubkey);
  if (!result) throw new Error(`sendDM failed (protocol=${protocol})`);
  return result;
}

function cachedToMessage(
  myPubkey: string,
  cached: CachedDMEvent,
  rumor: CachedRumor | undefined,
): DMMessage | null {
  if (cached.kind === 4) {
    const pTag = cached.tags.find((t) => t[0] === 'p');
    const recipientPubkey = pTag?.[1] ?? '';
    const plaintext = getPlaintext(myPubkey, cached.id);
    if (plaintext === undefined) return null;
    return {
      id: cached.id,
      senderPubkey: cached.pubkey,
      recipientPubkey,
      content: plaintext,
      createdAt: cached.created_at,
      protocol: 'nip04',
    };
  }
  if (cached.kind === 1059 && rumor) {
    return {
      id: rumor.rumorId || cached.id,
      senderPubkey: rumor.senderPubkey,
      recipientPubkey: rumor.recipientPubkey,
      content: rumor.content,
      createdAt: rumor.createdAt,
      protocol: 'nip17',
    };
  }
  return null;
}

/**
 * Subscribe to DMs for the current user (both NIP-04 and NIP-17).
 * Incoming events are written to the cache before the callback fires so the
 * UI is backed by durable storage. Returns a cleanup function.
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
      putEvent(myPubkey, toCachedEvent(event));

      const recipientTag = event.tags.find((t) => t[0] === 'p');
      const recipientPubkey = recipientTag?.[1] || '';
      const otherPubkey = event.pubkey === myPubkey ? recipientPubkey : event.pubkey;
      if (!otherPubkey) return;

      const otherUser = new NDKUser({ pubkey: otherPubkey });
      otherUser.ndk = ndk;

      await event.decrypt(otherUser, ndk.signer!, 'nip04');
      putPlaintext(myPubkey, event.id, event.content);

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
      putEvent(myPubkey, toCachedEvent(event));

      const { giftUnwrap } = await import('@nostr-dev-kit/ndk');
      const rumor = await giftUnwrap(event, undefined, ndk.signer!);
      if (rumor.kind !== 14) return;

      const recipientTag = rumor.tags.find((t) => t[0] === 'p');
      const recipientPubkey = recipientTag?.[1] || myPubkey;

      putRumor(myPubkey, {
        rumorId: rumor.id || event.id,
        wrapId: event.id,
        senderPubkey: rumor.pubkey,
        recipientPubkey,
        content: rumor.content,
        createdAt: rumor.created_at || Math.floor(Date.now() / 1000),
      });

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

interface FetchHistoryOptions {
  /** Fetch events strictly older than this unix timestamp (for infinite scroll). */
  before?: number;
  /** Max events to request per direction / filter. Default 50. */
  limit?: number;
  /** If true, skip cache and go straight to relays. */
  skipCache?: boolean;
}

/**
 * Fetch DM history with a specific user (both NIP-04 and NIP-17).
 * Cache-first: returns cached messages immediately on the first call; subsequent
 * pages load older messages via the `before` cursor. `hasMore` is false when
 * relays returned fewer events than requested.
 */
export async function fetchDMHistory(
  myPubkey: string,
  otherPubkey: string,
  options: FetchHistoryOptions = {},
): Promise<{ messages: DMMessage[]; hasMore: boolean }> {
  const ndk = getNDK();
  if (!ndk.signer) return { messages: [], hasMore: false };

  const limit = options.limit ?? 50;

  const otherUser = new NDKUser({ pubkey: otherPubkey });
  otherUser.ndk = ndk;

  const seen = new Set<string>();
  const messages: DMMessage[] = [];

  // Phase 1: drain cache. Only populate from cache when no `before` cursor is
  // set (first page). For pagination we hit relays directly.
  if (!options.before && !options.skipCache) {
    for (const ev of getCachedEvents(myPubkey)) {
      const rumor = ev.kind === 1059 ? getRumor(myPubkey, ev.id) : undefined;
      const msg = cachedToMessage(myPubkey, ev, rumor);
      if (!msg) continue;
      if (msg.senderPubkey !== otherPubkey && msg.recipientPubkey !== otherPubkey) continue;
      if (msg.senderPubkey !== myPubkey && msg.senderPubkey !== otherPubkey) continue;
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);
      messages.push(msg);
    }
  }

  // Phase 2: hit relays. Respect `before` cursor for pagination.
  const until = options.before;

  const nip04Filters: NDKFilter[] = [
    { kinds: [4], authors: [myPubkey], '#p': [otherPubkey], limit, ...(until ? { until } : {}) },
    { kinds: [4], authors: [otherPubkey], '#p': [myPubkey], limit, ...(until ? { until } : {}) },
  ];

  let relayReturned = 0;

  for (const filter of nip04Filters) {
    try {
      const events = await ndk.fetchEvents(filter);
      relayReturned += events.size;
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        putEvent(myPubkey, toCachedEvent(event));
        try {
          let plaintext = getPlaintext(myPubkey, event.id);
          if (plaintext === undefined) {
            await event.decrypt(otherUser, ndk.signer!, 'nip04');
            plaintext = event.content;
            putPlaintext(myPubkey, event.id, plaintext);
          }
          const recipientTag = event.tags.find((t) => t[0] === 'p');
          messages.push({
            id: event.id,
            senderPubkey: event.pubkey,
            recipientPubkey: recipientTag?.[1] || '',
            content: plaintext,
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

  // NIP-17: kind 1059 gift wraps addressed to me — only direction possible.
  const nip17Filter: NDKFilter = {
    kinds: [1059],
    '#p': [myPubkey],
    limit: limit * 2,
    ...(until ? { until } : {}),
  };

  try {
    const { giftUnwrap } = await import('@nostr-dev-kit/ndk');
    const wrapEvents = await ndk.fetchEvents(nip17Filter);
    relayReturned += wrapEvents.size;
    for (const wrap of wrapEvents) {
      if (seen.has(wrap.id)) continue;
      putEvent(myPubkey, toCachedEvent(wrap));

      let rumor = getRumor(myPubkey, wrap.id);
      if (!rumor) {
        try {
          const unwrapped = await giftUnwrap(wrap, undefined, ndk.signer!);
          if (unwrapped.kind !== 14) continue;
          const recipientTag = unwrapped.tags.find((t) => t[0] === 'p');
          rumor = {
            rumorId: unwrapped.id || wrap.id,
            wrapId: wrap.id,
            senderPubkey: unwrapped.pubkey,
            recipientPubkey: recipientTag?.[1] || '',
            content: unwrapped.content,
            createdAt: unwrapped.created_at || 0,
          };
          putRumor(myPubkey, rumor);
        } catch {
          continue;
        }
      }

      const isRelevant =
        (rumor.senderPubkey === otherPubkey && rumor.recipientPubkey === myPubkey) ||
        (rumor.senderPubkey === myPubkey && rumor.recipientPubkey === otherPubkey);
      if (!isRelevant) continue;

      if (seen.has(rumor.rumorId)) continue;
      seen.add(rumor.rumorId);

      messages.push({
        id: rumor.rumorId,
        senderPubkey: rumor.senderPubkey,
        recipientPubkey: rumor.recipientPubkey,
        content: rumor.content,
        createdAt: rumor.createdAt,
        protocol: 'nip17',
      });
    }
  } catch {
    // Relay error
  }

  messages.sort((a, b) => a.createdAt - b.createdAt);

  // hasMore heuristic: if relays returned at least `limit` on any filter we
  // still may have older events beyond the cursor. Conservatively report
  // true when the total return hit the request ceiling.
  const hasMore = relayReturned >= limit;

  return { messages, hasMore };
}

/**
 * Detect which protocol a conversation partner uses based on recent messages.
 * Returns true if NIP-04 messages are found in the last 10 messages.
 */
export function detectNip04InRecent(messages: DMMessage[], count = 10): boolean {
  const recent = messages.slice(-count);
  return recent.some((m) => m.protocol === 'nip04');
}

interface DiscoverOptions {
  /** Force a full relay scan even if cache says we scanned recently. */
  forceFullScan?: boolean;
  /** Called after the background relay sync finishes, with the updated threads map. */
  onUpdate?: (threads: Map<string, ThreadSummary>) => void;
}

/**
 * Compute DM unread counts from the local cache, using per-partner
 * read cursors that live on this device (localStorage — see useDMStore).
 * Events older than the cursor (or sent by us) don't count.
 */
export function computeUnreadCounts(
  myPubkey: string,
  readCursors: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const consider = (partner: string, senderPubkey: string, tsSec: number) => {
    if (!partner || partner === myPubkey) return;
    if (senderPubkey === myPubkey) return; // our own sends don't count
    const cutoffMs = readCursors[partner] ?? 0;
    if (tsSec * 1000 <= cutoffMs) return;
    out[partner] = (out[partner] ?? 0) + 1;
  };

  for (const ev of getCachedEvents(myPubkey)) {
    if (ev.kind === 4) {
      const pTag = ev.tags.find((t) => t[0] === 'p');
      const partner = ev.pubkey === myPubkey ? pTag?.[1] ?? '' : ev.pubkey;
      consider(partner, ev.pubkey, ev.created_at);
    } else if (ev.kind === 1059) {
      const rumor = getRumor(myPubkey, ev.id);
      if (!rumor) continue;
      const partner = rumor.senderPubkey === myPubkey ? rumor.recipientPubkey : rumor.senderPubkey;
      consider(partner, rumor.senderPubkey, rumor.createdAt);
    }
  }

  return out;
}

/**
 * Two-phase thread discovery:
 *  - Phase A: build the thread list from the local cache (instant, no relays,
 *    no signer prompts). Returned synchronously.
 *  - Phase B: in the background, fetch recent NIP-04 events and NIP-17 gift
 *    wraps from relays, merge into the cache, and re-emit the updated map via
 *    `onUpdate`. Respects the 24h full-scan cadence unless `forceFullScan`.
 */
export async function discoverDMThreads(
  myPubkey: string,
  options: DiscoverOptions = {},
): Promise<Map<string, ThreadSummary>> {
  // ── Phase A: cache-first ──────────────────────────────────────────────────
  const threads = buildThreadsFromCache(myPubkey);

  // ── Phase B: background relay sync ───────────────────────────────────────
  const ndk = getNDK();
  if (!ndk.signer) {
    console.warn('[dm] discoverDMThreads: no signer, skipping relay sync');
    return threads;
  }

  const sync = getSyncState(myPubkey);
  const now = Date.now();
  const shouldFullScan = options.forceFullScan || now - sync.lastFullScanAt > FULL_SCAN_INTERVAL_MS;

  // Run the sync but don't block the returned value: callers get the cached
  // map immediately and receive updates via onUpdate.
  void (async () => {
    try {
      console.log('[dm] starting relay sync', { fullScan: shouldFullScan, relays: ndk.pool?.relays?.size });
      const stats = await runRelaySync(myPubkey, shouldFullScan);
      console.log('[dm] relay sync done', stats);
      setSyncState(myPubkey, { lastPollAt: now, ...(shouldFullScan ? { lastFullScanAt: now } : {}) });
      if (options.onUpdate) {
        options.onUpdate(buildThreadsFromCache(myPubkey));
      }
    } catch (err) {
      console.warn('[dm] background sync failed:', err);
    }
  })();

  return threads;
}

function buildThreadsFromCache(myPubkey: string): Map<string, ThreadSummary> {
  const threads = new Map<string, ThreadSummary>();
  const partners = enumeratePartners(myPubkey);

  for (const [partner, info] of partners) {
    const latest = getLatestForPartner(myPubkey, partner);
    let lastMessage = '';
    if (latest) {
      if (latest.event.kind === 4) {
        lastMessage = getPlaintext(myPubkey, latest.event.id) ?? '';
      } else if (latest.rumor) {
        lastMessage = latest.rumor.content;
      }
    }
    threads.set(partner, {
      lastMessage,
      lastMessageAt: info.lastMessageAt,
      protocol: info.protocol,
    });
  }

  return threads;
}

/**
 * Fetch new DM events from relays (NIP-04 both directions + NIP-17 wraps to
 * me), write them to the cache, and decrypt the latest message per thread for
 * previews. `fullScan` triggers a wider sweep; otherwise we only pull since
 * the last poll.
 */
async function runRelaySync(
  myPubkey: string,
  fullScan: boolean,
): Promise<{ fetched: number; unwrapped: number; errors: number }> {
  const ndk = getNDK();
  const sync = getSyncState(myPubkey);
  const since = fullScan ? undefined : Math.max(0, Math.floor(sync.lastPollAt / 1000) - 60);
  const limit = fullScan ? 500 : 100;

  const filters: NDKFilter[] = [
    { kinds: [4], '#p': [myPubkey], limit, ...(since ? { since } : {}) },
    { kinds: [4], authors: [myPubkey], limit, ...(since ? { since } : {}) },
    { kinds: [1059], '#p': [myPubkey], limit, ...(since ? { since } : {}) },
  ];

  let fetched = 0;
  let unwrapped = 0;
  let errors = 0;

  for (const filter of filters) {
    try {
      const events = await ndk.fetchEvents(filter);
      fetched += events.size;
      for (const event of events) {
        putEvent(myPubkey, toCachedEvent(event));
        if (event.kind === 1059 && !getRumor(myPubkey, event.id)) {
          try {
            const { giftUnwrap } = await import('@nostr-dev-kit/ndk');
            const rumor = await giftUnwrap(event, undefined, ndk.signer!);
            if (rumor.kind !== 14) continue;
            const recipientTag = rumor.tags.find((t) => t[0] === 'p');
            putRumor(myPubkey, {
              rumorId: rumor.id || event.id,
              wrapId: event.id,
              senderPubkey: rumor.pubkey,
              recipientPubkey: recipientTag?.[1] || '',
              content: rumor.content,
              createdAt: rumor.created_at || 0,
            });
            unwrapped++;
          } catch {
            /* skip */
          }
        }
      }
    } catch (err) {
      errors++;
      console.warn('[dm] filter failed:', filter, err);
    }
  }

  // Decrypt previews: for each partner, decrypt the latest NIP-04 event if we
  // don't already have its plaintext cached. We intentionally decrypt only
  // the newest per thread to minimize signer popups on bunker signers.
  const partners = enumeratePartners(myPubkey);
  for (const [partner] of partners) {
    const latest = getLatestForPartner(myPubkey, partner);
    if (!latest || latest.event.kind !== 4) continue;
    if (getPlaintext(myPubkey, latest.event.id) !== undefined) continue;

    try {
      const { NDKEvent } = await import('@nostr-dev-kit/ndk');
      const ev = new NDKEvent(ndk, {
        id: latest.event.id,
        pubkey: latest.event.pubkey,
        kind: 4,
        content: latest.event.content,
        tags: latest.event.tags,
        created_at: latest.event.created_at,
        sig: latest.event.sig ?? '',
      });
      const senderPk = latest.event.pubkey === myPubkey ? partner : latest.event.pubkey;
      const otherUser = new NDKUser({ pubkey: senderPk });
      otherUser.ndk = ndk;
      await ev.decrypt(otherUser, ndk.signer!, 'nip04');
      putPlaintext(myPubkey, latest.event.id, ev.content);
    } catch {
      /* skip */
    }
  }

  return { fetched, unwrapped, errors };
}
