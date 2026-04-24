/**
 * Per-device cache for Nostr DMs (NIP-04 + NIP-17).
 *
 * Why this exists: we can't persist decrypted DM content on the server (that
 * would defeat the point of E2E-encrypted DMs), and every cold load re-fetching
 * events + decrypting them triggers signer-popup storms on NIP-46 bunkers and
 * makes thread previews impossible. So we keep a per-user cache here on the
 * device, keyed by the logged-in pubkey.
 *
 * Storage: a single localStorage key per user holding a JSON blob. Large
 * enough for power-user use (localStorage is ~5MB per origin); we cap events
 * per user and LRU-evict the oldest beyond the cap.
 */

import { KIND_ENCRYPTED_DM, KIND_GIFT_WRAP } from './nip-kinds';

export interface CachedDMEvent {
  id: string;
  pubkey: string; // event author
  created_at: number;
  kind: typeof KIND_ENCRYPTED_DM | typeof KIND_GIFT_WRAP;
  content: string;
  tags: string[][];
  sig?: string;
}

export interface CachedRumor {
  rumorId: string;
  wrapId: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  createdAt: number;
}

export interface DMSyncState {
  lastFullScanAt: number;
  lastPollAt: number;
  inboxRelaysPublishedAt: number;
}

interface CacheShape {
  events: Record<string, CachedDMEvent>;
  rumors: Record<string, CachedRumor>; // keyed by wrapId
  decrypted: Record<string, string>; // eventId -> plaintext
  syncState: DMSyncState;
}

const EVENT_CAP = 2000;
const DEFAULT_SYNC_STATE: DMSyncState = {
  lastFullScanAt: 0,
  lastPollAt: 0,
  inboxRelaysPublishedAt: 0,
};

function keyFor(myPubkey: string): string {
  return `obelisk:dm-cache:${myPubkey}`;
}

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function emptyCache(): CacheShape {
  return { events: {}, rumors: {}, decrypted: {}, syncState: { ...DEFAULT_SYNC_STATE } };
}

function readCache(myPubkey: string): CacheShape {
  if (!hasStorage()) return emptyCache();
  try {
    const raw = localStorage.getItem(keyFor(myPubkey));
    if (!raw) return emptyCache();
    const parsed = JSON.parse(raw) as Partial<CacheShape>;
    return {
      events: parsed.events ?? {},
      rumors: parsed.rumors ?? {},
      decrypted: parsed.decrypted ?? {},
      syncState: { ...DEFAULT_SYNC_STATE, ...(parsed.syncState ?? {}) },
    };
  } catch {
    return emptyCache();
  }
}

function writeCache(myPubkey: string, cache: CacheShape): void {
  if (!hasStorage()) return;
  try {
    // Enforce event cap: keep newest EVENT_CAP events by created_at.
    const ids = Object.keys(cache.events);
    if (ids.length > EVENT_CAP) {
      const sorted = ids
        .map((id) => ({ id, ts: cache.events[id].created_at }))
        .sort((a, b) => b.ts - a.ts);
      const keep = new Set(sorted.slice(0, EVENT_CAP).map((e) => e.id));
      const newEvents: Record<string, CachedDMEvent> = {};
      const newDecrypted: Record<string, string> = {};
      for (const id of keep) {
        newEvents[id] = cache.events[id];
        if (cache.decrypted[id]) newDecrypted[id] = cache.decrypted[id];
      }
      // Also drop rumors whose wrap was evicted
      const newRumors: Record<string, CachedRumor> = {};
      for (const [wrapId, rumor] of Object.entries(cache.rumors)) {
        if (keep.has(wrapId)) newRumors[wrapId] = rumor;
      }
      cache.events = newEvents;
      cache.decrypted = newDecrypted;
      cache.rumors = newRumors;
    }
    localStorage.setItem(keyFor(myPubkey), JSON.stringify(cache));
  } catch (err) {
    // QuotaExceeded etc — log once and give up; cache is best-effort.
    console.warn('[dm-cache] writeCache failed:', err);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getCachedEvents(myPubkey: string): CachedDMEvent[] {
  return Object.values(readCache(myPubkey).events);
}

export function getCachedEvent(myPubkey: string, id: string): CachedDMEvent | undefined {
  return readCache(myPubkey).events[id];
}

export function putEvent(myPubkey: string, event: CachedDMEvent): void {
  const cache = readCache(myPubkey);
  cache.events[event.id] = event;
  writeCache(myPubkey, cache);
}

export function putEvents(myPubkey: string, events: CachedDMEvent[]): void {
  if (events.length === 0) return;
  const cache = readCache(myPubkey);
  for (const ev of events) cache.events[ev.id] = ev;
  writeCache(myPubkey, cache);
}

export function getRumor(myPubkey: string, wrapId: string): CachedRumor | undefined {
  return readCache(myPubkey).rumors[wrapId];
}

export function getAllRumors(myPubkey: string): CachedRumor[] {
  return Object.values(readCache(myPubkey).rumors);
}

export function putRumor(myPubkey: string, rumor: CachedRumor): void {
  const cache = readCache(myPubkey);
  cache.rumors[rumor.wrapId] = rumor;
  writeCache(myPubkey, cache);
}

export function getPlaintext(myPubkey: string, eventId: string): string | undefined {
  return readCache(myPubkey).decrypted[eventId];
}

export function putPlaintext(myPubkey: string, eventId: string, text: string): void {
  const cache = readCache(myPubkey);
  cache.decrypted[eventId] = text;
  writeCache(myPubkey, cache);
}

export function getSyncState(myPubkey: string): DMSyncState {
  return readCache(myPubkey).syncState;
}

export function setSyncState(myPubkey: string, patch: Partial<DMSyncState>): void {
  const cache = readCache(myPubkey);
  cache.syncState = { ...cache.syncState, ...patch };
  writeCache(myPubkey, cache);
}

export function clearCache(myPubkey: string): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(keyFor(myPubkey));
  } catch {
    /* ignore */
  }
}

/**
 * Returns the most recent cached event for a given partner, using NIP-04
 * events directly and NIP-17 gift wraps via their unwrapped rumor (looked up
 * by wrapId in the rumors store). Used to compute thread preview + ordering
 * without re-decrypting anything.
 */
export function getLatestForPartner(
  myPubkey: string,
  partnerPubkey: string,
): { event: CachedDMEvent; rumor?: CachedRumor } | undefined {
  const cache = readCache(myPubkey);
  let best: { event: CachedDMEvent; rumor?: CachedRumor; ts: number } | undefined;

  for (const ev of Object.values(cache.events)) {
    if (ev.kind === KIND_ENCRYPTED_DM) {
      const pTag = ev.tags.find((t) => t[0] === 'p');
      const other = ev.pubkey === myPubkey ? pTag?.[1] : ev.pubkey;
      if (other !== partnerPubkey) continue;
      const ts = ev.created_at;
      if (!best || ts > best.ts) best = { event: ev, ts };
    } else if (ev.kind === KIND_GIFT_WRAP) {
      const rumor = cache.rumors[ev.id];
      if (!rumor) continue;
      const other = rumor.senderPubkey === myPubkey ? rumor.recipientPubkey : rumor.senderPubkey;
      if (other !== partnerPubkey) continue;
      const ts = rumor.createdAt;
      if (!best || ts > best.ts) best = { event: ev, rumor, ts };
    }
  }

  return best;
}

/**
 * Enumerate every partner we have cached messages with, returning a per-partner
 * summary (last message timestamp + the chosen event, and whether that event
 * was NIP-04 or NIP-17). Used by discoverDMThreads for the instant phase.
 */
export function enumeratePartners(
  myPubkey: string,
): Map<string, { lastMessageAt: number; protocol: 'nip04' | 'nip17'; eventId: string }> {
  const cache = readCache(myPubkey);
  const out = new Map<string, { lastMessageAt: number; protocol: 'nip04' | 'nip17'; eventId: string }>();

  const consider = (partner: string, ts: number, protocol: 'nip04' | 'nip17', eventId: string) => {
    if (!partner || partner === myPubkey) return;
    const existing = out.get(partner);
    if (!existing || ts > existing.lastMessageAt) {
      out.set(partner, { lastMessageAt: ts, protocol, eventId });
    }
  };

  for (const ev of Object.values(cache.events)) {
    if (ev.kind === KIND_ENCRYPTED_DM) {
      const pTag = ev.tags.find((t) => t[0] === 'p');
      const other = ev.pubkey === myPubkey ? pTag?.[1] ?? '' : ev.pubkey;
      consider(other, ev.created_at, 'nip04', ev.id);
    } else if (ev.kind === KIND_GIFT_WRAP) {
      const rumor = cache.rumors[ev.id];
      if (!rumor) continue;
      const other = rumor.senderPubkey === myPubkey ? rumor.recipientPubkey : rumor.senderPubkey;
      consider(other, rumor.createdAt, 'nip17', ev.id);
    }
  }

  return out;
}
