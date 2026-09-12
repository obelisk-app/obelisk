/**
 * The one door into the games store.
 *
 * Four things deliver kind 2390 events — the channel subscription, the
 * per-card resolver, the local echo of our own publishes, and the localStorage
 * seed — and every one of them arrives in bursts. Handing them to the store one
 * at a time meant one zustand update, one notification pass and one render per
 * event, and since a render re-derives the table, a 500-event backfill cost 500
 * replays per visible card. So they queue here and land in a single batch.
 *
 * The batch is a trailing timer rather than a microtask on purpose: relay
 * events arrive across many macrotasks as the socket drains, and a microtask
 * would flush between each one and coalesce nothing.
 */
import { useGamesStore } from '@/store/games';
import { registerClientResetHook } from '@/lib/reset';
import type { ParsedGameEvent } from './protocol';

/**
 * How long a burst is allowed to accumulate. Roughly two frames: long enough
 * to swallow a socket drain, short enough that the local echo of your own move
 * is still imperceptible.
 */
export const INGEST_BATCH_MS = 32;

let queue: ParsedGameEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Called after each flush with the table ids it touched. Wired up by the cache. */
let onFlush: ((gameIds: readonly string[]) => void) | null = null;

export function setGameIngestListener(fn: ((gameIds: readonly string[]) => void) | null): void {
  onFlush = fn;
}

export function ingestGameEvent(ev: ParsedGameEvent): void {
  queue.push(ev);
  if (timer === null) timer = setTimeout(flushGameIngest, INGEST_BATCH_MS);
}

export function ingestGameEvents(evs: readonly ParsedGameEvent[]): void {
  if (evs.length === 0) return;
  for (const ev of evs) queue.push(ev);
  if (timer === null) timer = setTimeout(flushGameIngest, INGEST_BATCH_MS);
}

export function flushGameIngest(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  useGamesStore.getState().ingestMany(batch);
  if (onFlush) {
    const touched = new Set<string>();
    for (const ev of batch) touched.add(ev.gameId);
    onFlush([...touched]);
  }
}

/** Drop a pending batch without applying it. Login/logout teardown and tests. */
export function resetGameIngest(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  queue = [];
}

// Tables are relay state, but which tables you can see depends on which relay
// you are authenticated against — so they do not survive an account switch.
// The queue is dropped before the store, or a batch in flight lands after it.
registerClientResetHook(() => {
  resetGameIngest();
  useGamesStore.getState().reset();
});
