// src/lib/dm/relay-list-cache.ts
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { sharedCoalescer } from '@/lib/nostr-coalescer';
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

const coalescer = sharedCoalescer;
const subscribers = new Map<string, Set<(r: RelayListResult) => void>>();

export function _resetRelayCache(): void { subscribers.clear(); }

function key(me: string) { return `obelisk:relays:${me}`; }
function read(me: string): Record<string, CacheEntry> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(key(me)) ?? '{}'); } catch { return {}; }
}
function write(me: string, blob: Record<string, CacheEntry>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key(me), JSON.stringify(blob)); } catch { /* ignore */ }
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
  // If neither slot has been checked, treat as stale (forces an initial fetch).
  if (!entry.outbox && !entry.inbox) return true;
  // Otherwise, only consider populated slots: stale if any *checked* slot is older than TTL.
  // This avoids endlessly re-fetching when a partner has never published one of the kinds
  // (e.g. no kind-10050) — once we've heard back from at least one, we honor the TTL.
  if (entry.outbox && now - entry.outbox.lastCheckedAt > TTL_MS) return true;
  if (entry.inbox && now - entry.inbox.lastCheckedAt > TTL_MS) return true;
  return false;
}

function notify(me: string, partner: string, r: RelayListResult): void {
  subscribers.get(`${me}|${partner}`)?.forEach((cb) => cb(r));
}

export function getRelays(
  me: string,
  partner: string,
  opts: { onUpdate?: (r: RelayListResult) => void } = {},
): { result: RelayListResult; dispose?: () => void } {
  const all = read(me);
  const entry = all[partner];
  const result = buildResult(entry);

  if (opts.onUpdate) {
    const subKey = `${me}|${partner}`;
    if (!subscribers.has(subKey)) subscribers.set(subKey, new Set());
    subscribers.get(subKey)!.add(opts.onUpdate);
  }

  if (!entry || isStale(entry)) {
    coalescer.enqueue({
      filters: [
        { kinds: [10002], authors: [partner], limit: 1 },
        { kinds: [10050], authors: [partner], limit: 1 },
      ],
      relays: FALLBACK_RELAYS,
      onEvent: (event: NostrEvent) => {
        if (event.pubkey !== partner) return;
        const current = read(me);
        const slot = current[partner] ?? {};
        const which: 'outbox' | 'inbox' | null =
          event.kind === 10002 ? 'outbox' : event.kind === 10050 ? 'inbox' : null;
        if (!which) return;
        const prev = slot[which]?.event;
        const sameContent =
          prev && prev.created_at >= event.created_at && JSON.stringify(prev.tags) === JSON.stringify(event.tags);
        if (sameContent) {
          slot[which] = { event: prev!, lastCheckedAt: Date.now() };
          current[partner] = slot;
          write(me, current);
          return;
        }
        slot[which] = { event, lastCheckedAt: Date.now() };
        current[partner] = slot;
        write(me, current);
        notify(me, partner, buildResult(slot));
      },
    });
  }

  const dispose = opts.onUpdate
    ? () => subscribers.get(`${me}|${partner}`)?.delete(opts.onUpdate!)
    : undefined;

  return { result, dispose };
}
