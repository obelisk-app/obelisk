// src/lib/dm/relay-list-cache.ts
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { sharedCoalescer, createKeyedObservable, type Slot } from '@nostr-wot/data';
import { parseRelayListMeta, parseInboxRelays } from '@/lib/nostr-read';

export interface RelayListResult {
  inbox: string[];
  readRelays: string[];
  writeRelays: string[];
  stale: boolean;
}

interface CacheEntry {
  outbox?: { event: NostrEvent; lastCheckedAt: number };
  inbox?: { event: NostrEvent; lastCheckedAt: number };
}

const TTL_MS = 6 * 3600 * 1000;
const FALLBACK_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://purplepag.es',
];

// In-memory authoritative state. localStorage is the cold-load seed below.
const relayStore = createKeyedObservable<string, CacheEntry>();

export function _resetRelayCache(): void {
  relayStore._reset();
}

/** Hook accessor — exposes the underlying observable so React hooks can
 *  bind via useSyncExternalStore. */
export function _relayStore() { return relayStore; }

function slotKey(me: string, partner: string): string { return `${me}|${partner}`; }
function storageKey(me: string): string { return `obelisk:relays:${me}`; }

function readPersisted(me: string): Record<string, CacheEntry> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(storageKey(me)) ?? '{}'); } catch { return {}; }
}

function writePersisted(me: string, blob: Record<string, CacheEntry>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(storageKey(me), JSON.stringify(blob)); } catch { /* ignore */ }
}

function hydrateSlot(me: string, partner: string): Slot<CacheEntry> {
  const k = slotKey(me, partner);
  const slot = relayStore.get(k);
  if (slot.value !== undefined) return slot;
  const persisted = readPersisted(me)[partner];
  if (persisted) {
    relayStore.set(k, persisted);
    return relayStore.get(k);
  }
  return slot;
}

/** Project a stored cache entry into the public `RelayListResult` shape.
 *  Exposed for the `useRelayList` hook (which needs a stable snapshot
 *  source + a `useMemo`-based derivation). */
export function entryToRelayListResult(entry: CacheEntry | undefined): RelayListResult {
  return buildResult(entry);
}

function buildResult(entry: CacheEntry | undefined): RelayListResult {
  const outbox = entry?.outbox ? parseRelayListMeta(entry.outbox.event) : { read: [], write: [] };
  const inbox = entry?.inbox ? parseInboxRelays(entry.inbox.event) : [];
  return {
    readRelays: outbox.read,
    writeRelays: outbox.write,
    inbox,
    stale: !entry || isStale(entry),
  };
}

function isStale(entry: CacheEntry): boolean {
  const now = Date.now();
  // Cold start (neither slot populated) → stale; forces an initial fetch.
  if (!entry.outbox && !entry.inbox) return true;
  // Only consider populated slots: stale if any *checked* slot is older than TTL.
  // Avoids endless re-fetching when a partner never publishes one of the kinds
  // (e.g. no kind-10050) — once at least one came back, honor the TTL.
  if (entry.outbox && now - entry.outbox.lastCheckedAt > TTL_MS) return true;
  if (entry.inbox && now - entry.inbox.lastCheckedAt > TTL_MS) return true;
  return false;
}

export function getRelays(
  me: string,
  partner: string,
  opts: { onUpdate?: (r: RelayListResult) => void } = {},
): { result: RelayListResult; dispose?: () => void } {
  const k = slotKey(me, partner);
  const slot = hydrateSlot(me, partner);
  const entry = slot.value;
  const result = buildResult(entry);

  let unsubStore: (() => void) | undefined;
  if (opts.onUpdate) {
    const cb = opts.onUpdate;
    unsubStore = relayStore.subscribe(k, (s) => {
      if (s.value !== undefined) cb(buildResult(s.value));
    });
  }

  if (!entry || isStale(entry)) {
    sharedCoalescer.enqueue({
      filters: [
        { kinds: [10002], authors: [partner], limit: 1 },
        { kinds: [10050], authors: [partner], limit: 1 },
      ],
      relays: FALLBACK_RELAYS,
      onEvent: (event: NostrEvent) => {
        if (event.pubkey !== partner) return;
        const current = relayStore.get(k).value ?? {};
        const which: 'outbox' | 'inbox' | null =
          event.kind === 10002 ? 'outbox' : event.kind === 10050 ? 'inbox' : null;
        if (!which) return;
        const prev = current[which]?.event;
        const sameContent =
          prev && prev.created_at >= event.created_at && JSON.stringify(prev.tags) === JSON.stringify(event.tags);
        const nextEntry: CacheEntry = { ...current };
        if (sameContent) {
          // Refresh lastCheckedAt only — keep the existing event reference,
          // and persist + skip the in-memory update (no notification).
          nextEntry[which] = { event: prev!, lastCheckedAt: Date.now() };
          const blob = readPersisted(me);
          blob[partner] = nextEntry;
          writePersisted(me, blob);
          return;
        }
        nextEntry[which] = { event, lastCheckedAt: Date.now() };
        const blob = readPersisted(me);
        blob[partner] = nextEntry;
        writePersisted(me, blob);
        relayStore.set(k, nextEntry);
      },
    });
  }

  return { result, dispose: unsubStore };
}
