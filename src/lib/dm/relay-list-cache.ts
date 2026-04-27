// src/lib/dm/relay-list-cache.ts
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { parseRelayListMeta, parseInboxRelays } from '@/lib/nostr-read';
import { createKeyedObservable, type Slot } from '@/lib/nostr-store';
import { subscribeReplaceable, type ReplaceableEntry } from '@/lib/nostr-resource';

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

// Per-kind replaceable wrapper: one ReplaceableEntry slot per (10002, 10050).
// Composing two `subscribeReplaceable` instances keeps the dedup-by-
// created_at contract consistent with profile-cache, follows, etc., at the
// cost of issuing two filters per partner. The coalescer groups them into
// one REQ when fired in the same window so wire-cost is unchanged.
type SlotEntry = { event: NostrEvent };

function persistKind(
  me: string,
  partner: string,
  which: 'outbox' | 'inbox',
  entry: SlotEntry,
): void {
  const k = slotKey(me, partner);
  const current = relayStore.get(k).value ?? {};
  const next: CacheEntry = {
    ...current,
    [which]: { event: entry.event, lastCheckedAt: Date.now() },
  };
  const blob = readPersisted(me);
  blob[partner] = next;
  writePersisted(me, blob);
  relayStore.set(k, next);
}

export interface SubscribeRelaysOpts {
  onCache?: (r: RelayListResult) => void;
  onUpdate?: (r: RelayListResult) => void;
}

/**
 * Subscribe to a partner's NIP-65 (kind 10002) outbox + NIP-17 (kind 10050)
 * inbox relay lists. Built from two `subscribeReplaceable` instances so
 * dedup-by-created_at and per-kind cache writes are inherited from the
 * generic primitive.
 *
 * The composite `RelayListResult` is rebuilt from the keyed observable on
 * every store change, so the consumer sees a single coherent value
 * regardless of which kind landed first.
 */
export function subscribeRelays(
  me: string,
  partner: string,
  opts: SubscribeRelaysOpts = {},
): () => void {
  const k = slotKey(me, partner);
  hydrateSlot(me, partner); // seed in-memory slot from localStorage if cold
  const initial = relayStore.get(k).value;
  if (opts.onCache) opts.onCache(buildResult(initial));

  const fire = (kind: 10002 | 10050): (() => void) => subscribeReplaceable<SlotEntry & ReplaceableEntry>({
    filters: [{ kinds: [kind], authors: [partner], limit: 1 }],
    relays: FALLBACK_RELAYS,
    hydrate: () => {
      const cur = relayStore.get(k).value;
      const slot = kind === 10002 ? cur?.outbox : cur?.inbox;
      return slot ? { event: slot.event } : null;
    },
    persist: (entry) => persistKind(me, partner, kind === 10002 ? 'outbox' : 'inbox', entry),
    parse: (event) => ({ event }),
    match: (event) => event.kind === kind && event.pubkey === partner,
    // Notification fan-out: relayStore.subscribe will fire whenever either
    // kind's persist runs. We forward to onUpdate via a single subscription
    // on the composite slot below.
  });

  const close10002 = fire(10002);
  const close10050 = fire(10050);
  let unsubStore: (() => void) | undefined;
  if (opts.onUpdate) {
    const cb = opts.onUpdate;
    unsubStore = relayStore.subscribe(k, (s) => {
      if (s.value !== undefined) cb(buildResult(s.value));
    });
  }
  return () => {
    close10002();
    close10050();
    unsubStore?.();
  };
}

// Compat shim — older call sites use the result-shape API.
export function getRelays(
  me: string,
  partner: string,
  opts: { onUpdate?: (r: RelayListResult) => void } = {},
): { result: RelayListResult; dispose?: () => void } {
  let result: RelayListResult = buildResult(undefined);
  const dispose = subscribeRelays(me, partner, {
    onCache: (r) => { result = r; },
    onUpdate: opts.onUpdate,
  });
  return { result, dispose };
}
