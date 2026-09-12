/**
 * localStorage cache for game logs — so a card paints on reload instead of
 * waiting for a socket.
 *
 * Every other relay-derived thing the chat shell paints has a `bridgeCache`
 * entry behind it; game tables did not, so `useGamesStore` started empty on
 * every page load and every card was a skeleton until the relay handshake, the
 * NIP-42 AUTH and the whole 24-hour channel backfill had finished. This is the
 * kind-9 pattern from `src/lib/nostr-bridge/cache.ts` applied one level down:
 * an ingest writer, debounced, and a seed reader.
 *
 * Two decisions worth the words:
 *
 * **Keyed per table, not per channel.** A `GameCard` knows its `gameId` and
 * nothing else — not its channel, not even whether the table exists. Per-table
 * keys are what let it seed itself, synchronously, before its first paint.
 *
 * **Checkpoints are omitted whole, never stripped.** A Stacker `checkpoint`
 * carries `inputs` and `board` blobs, which are most of the bytes on the wire
 * and would blow the quota. The tempting fix — cache the checkpoint with those
 * two fields removed — is unsafe, not merely lossy: the store dedupes by event
 * id, so a stripped copy seeded under its real id would permanently shadow the
 * real event when the relay delivers it, and `verifyCheckpoint` would be
 * looking at a checkpoint with no inputs for as long as the tab lives. Omitting
 * the event entirely leaves the seed a strict *subset* of the true log, which
 * replays to a session that is valid and merely behind, and every omitted event
 * still arrives fresh from the relay.
 */
import { cacheGet, cacheSet, cacheDelete } from '@/lib/nostr-bridge/cache';
import { getBridgeImpl } from '@/lib/nostr-bridge/client';
import { KIND_GAME } from '@/lib/nip-kinds';
import { useGamesStore } from '@/store/games';
import { setGameIngestListener } from './ingest';
import type { GameOp, ParsedGameEvent } from './protocol';

/**
 * Events cached per table. A table past this is skipped rather than truncated:
 * a truncated log replays to a plausible *wrong* status ("Open table" for a
 * finished match), while an absent one replays to a skeleton, which is honest.
 */
export const GAME_CACHE_EVENT_LIMIT = 120;

/** Matches CACHE_FLUSH_DELAY_MS in client.ts — one write per burst, not per event. */
export const GAME_CACHE_FLUSH_MS = 200;

const dirty = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Registered here rather than the other way round: `ingest.ts` is the seam
// everything writes through and must not know about the cache, or importing it
// (which the store's own reset path does) would drag localStorage in with it.
setGameIngestListener(scheduleGameCacheFlush);

/**
 * Which relay a cached log belongs to. Read synchronously off the bridge, and
 * `null` before login — a flush with no session must not write the next
 * account's tables under the previous account's relay.
 */
function relayKey(): string | null {
  const impl = getBridgeImpl();
  if (!impl) return null;
  if (!impl.getPublicKey()) return null;
  const relay = impl.currentRelayUrl.get();
  return relay || null;
}

/**
 * Seed one table from disk. Synchronous, so a `useLayoutEffect` caller commits
 * the skeleton but never paints it.
 */
export function seedGameFromCache(gameId: string): void {
  const relay = relayKey();
  if (!relay) return;
  if (useGamesStore.getState().logs[gameId]) return;

  const entry = cacheGet<unknown>(relay, KIND_GAME, gameId);
  if (!entry) return;

  const events = validate(entry.value);
  if (!events) {
    // Written by an older shape, or corrupt. `parseGameEvent` is not re-run on
    // the way out of the cache, so this is the only gate there is.
    cacheDelete(relay, KIND_GAME, gameId);
    return;
  }
  // Straight to the store, NOT through the batching seam. The batch exists to
  // coalesce a relay burst arriving across many macrotasks; a seed is already
  // one batch, and a 32ms delay here would mean the caller's layout effect
  // resolves after the paint it exists to beat.
  useGamesStore.getState().ingestMany(events);
}

/** Note that a table's log changed. The write itself is debounced. */
export function scheduleGameCacheFlush(gameIds: readonly string[]): void {
  for (const id of gameIds) dirty.add(id);
  if (dirty.size === 0) return;
  if (flushTimer === null) flushTimer = setTimeout(flushGameCache, GAME_CACHE_FLUSH_MS);
}

export function flushGameCache(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (dirty.size === 0) return;
  const ids = [...dirty];
  dirty.clear();

  const relay = relayKey();
  if (!relay) return;

  const { logs } = useGamesStore.getState();
  for (const gameId of ids) {
    const log = logs[gameId];
    if (!log) continue;
    const keep = log.filter((e) => e.op !== 'checkpoint');
    if (keep.length === 0 || keep.length > GAME_CACHE_EVENT_LIMIT) continue;
    cacheSet(relay, KIND_GAME, gameId, keep);
  }
}

/** Test seam and teardown: drop pending writes without applying them. */
export function resetGameCacheWriter(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  dirty.clear();
}

const OPS: ReadonlySet<string> = new Set<GameOp>([
  'create', 'join', 'start', 'move', 'timeout', 'resign', 'cancel',
  'attack', 'topout', 'checkpoint',
]);

/** Shape gate for anything coming back off disk. */
function validate(value: unknown): ParsedGameEvent[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id) return null;
    if (typeof e.pubkey !== 'string' || !e.pubkey) return null;
    if (typeof e.gameId !== 'string' || !e.gameId) return null;
    if (typeof e.channelId !== 'string' || !e.channelId) return null;
    if (typeof e.createdAt !== 'number' || !Number.isFinite(e.createdAt)) return null;
    if (typeof e.op !== 'string' || !OPS.has(e.op)) return null;
  }
  return value as ParsedGameEvent[];
}
