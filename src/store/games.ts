/**
 * Client state for relay-hosted games.
 *
 * The store holds the raw event log per table — never a derived board. The
 * board is recomputed from the log by `replayLog` on read, so an event that
 * arrives late (relay reconnect, a peer's re-publish, history backfill) can
 * never leave a client on a state some other client disagrees with.
 *
 * Deriving on every read used to mean *replaying on every read*, which is what
 * made a channel with a few game cards in it crawl: a fresh `logs` object per
 * ingested event, a whole-map subscription in `useGameSession`, and one full
 * sort-and-replay per card per event. The replay is still the only source of
 * truth — it is now cached by the identity of the log array it consumed, which
 * is exactly as strict and costs nothing.
 */
import { create } from 'zustand';
import type { ParsedGameEvent } from '@/lib/games/protocol';
import { replayLog, applyWaitingExpiry, type GameSession } from '@/lib/games/session';

interface GamesStore {
  /** gameId → its log, unsorted. `replayLog` owns ordering. */
  logs: Record<string, ParsedGameEvent[]>;
  /** gameId → channelId, so the UI can find a table's home without a scan. */
  channelOf: Record<string, string>;
  /** Table currently open in the game modal. */
  openGameId: string | null;

  ingest: (ev: ParsedGameEvent) => void;
  ingestMany: (evs: readonly ParsedGameEvent[]) => void;
  clearChannel: (channelId: string) => void;
  setOpenGame: (gameId: string | null) => void;
  /** Drop everything. Login/logout teardown, and the reset seam for tests. */
  reset: () => void;
}

/**
 * Event ids already in `logs`, so the dedupe on ingest is a hash lookup rather
 * than a scan of the table's log.
 *
 * Deliberately module state mutated in place, not a field on the store: it is
 * an index, never selected, never rendered. Copying it per batch would
 * reintroduce exactly the per-event O(n) work it exists to remove. It is kept
 * in lockstep with `logs` by every writer below — `reset` and `clearChannel`
 * included, or a channel you came back to could never re-ingest.
 */
const seen = new Set<string>();

export const useGamesStore = create<GamesStore>((set) => ({
  logs: {},
  channelOf: {},
  openGameId: null,

  ingest: (ev) => set((s) => mergeEvents(s, [ev])),
  ingestMany: (evs) => set((s) => mergeEvents(s, evs)),

  clearChannel: (channelId) => set((s) => {
    const logs = { ...s.logs };
    const channelOf = { ...s.channelOf };
    for (const [gameId, ch] of Object.entries(s.channelOf)) {
      if (ch !== channelId) continue;
      for (const ev of logs[gameId] ?? []) seen.delete(ev.id);
      delete logs[gameId];
      delete channelOf[gameId];
    }
    return { logs, channelOf };
  }),

  setOpenGame: (gameId) => set({ openGameId: gameId }),

  reset: () => {
    seen.clear();
    set({ logs: {}, channelOf: {}, openGameId: null });
  },
}));

function mergeEvents(
  s: { logs: Record<string, ParsedGameEvent[]>; channelOf: Record<string, string> },
  evs: readonly ParsedGameEvent[],
): Partial<GamesStore> {
  // Group first, then copy once per touched table. Copying per event turned a
  // 500-event backfill into 500 array copies and 500 store notifications.
  let fresh: Map<string, ParsedGameEvent[]> | null = null;
  let channelOf: Record<string, string> | null = null;

  for (const ev of evs) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    fresh = fresh ?? new Map();
    const bucket = fresh.get(ev.gameId);
    if (bucket) bucket.push(ev);
    else fresh.set(ev.gameId, [ev]);
    if (s.channelOf[ev.gameId] !== ev.channelId) {
      channelOf = channelOf ?? { ...s.channelOf };
      channelOf[ev.gameId] = ev.channelId;
    }
  }

  // Nothing new: return the same state objects, so every memo keyed on a log
  // array — and every component subscribed to one — stays valid.
  if (!fresh) return {};

  const logs = { ...s.logs };
  for (const [gameId, added] of fresh) {
    logs[gameId] = [...(s.logs[gameId] ?? []), ...added];
  }
  return channelOf ? { logs, channelOf } : { logs };
}

/**
 * Replays, keyed by the identity of the log array.
 *
 * A `WeakMap` rather than an LRU because the key IS the log: `mergeEvents` is
 * copy-on-write, so an event produces a new array, the old key becomes
 * unreachable, and the entry is collected. There is no eviction policy to tune
 * and no staleness window to get wrong — a stale log is a different object, so
 * it is a different cache entry. It is impossible for this cache to hand back a
 * session derived from a log that has since grown.
 *
 * `EXPIRED` holds the cancelled clone a stale waiting table derives to, so its
 * identity is stable across clock ticks instead of churning a new object every
 * 30 seconds forever.
 */
const BASE = new WeakMap<readonly ParsedGameEvent[], GameSession | null>();
const EXPIRED = new WeakMap<readonly ParsedGameEvent[], GameSession>();

/** Rebuild one table. Returns `null` until its `create` event has arrived. */
export function selectSession(
  state: { logs: Record<string, ParsedGameEvent[]> },
  gameId: string,
  now?: number,
): GameSession | null {
  const log = state.logs[gameId];
  if (!log || log.length === 0) return null;

  let base = BASE.get(log);
  if (base === undefined) {
    base = replayLog(log);
    // Sessions are now shared between renders and between cards, so a consumer
    // mutating one would corrupt everybody's view without changing the object
    // identity React compares. Nothing does today; freeze in dev so the day
    // something starts, it throws instead of going quietly wrong. Shallow on
    // purpose — `state` and `match` are engine-owned.
    if (base && process.env.NODE_ENV !== 'production') Object.freeze(base);
    BASE.set(log, base);
  }
  if (!base) return null;

  const resolvedNow = now ?? Math.floor(Date.now() / 1000);
  const withExpiry = applyWaitingExpiry(base, resolvedNow);
  if (withExpiry === base) return base;

  const cached = EXPIRED.get(log);
  if (cached) return cached;
  if (process.env.NODE_ENV !== 'production') Object.freeze(withExpiry);
  EXPIRED.set(log, withExpiry);
  return withExpiry;
}

/** Every table in a channel, newest first. */
export function selectChannelSessions(
  state: { logs: Record<string, ParsedGameEvent[]>; channelOf: Record<string, string> },
  channelId: string,
  now?: number,
): GameSession[] {
  const out: GameSession[] = [];
  for (const [gameId, ch] of Object.entries(state.channelOf)) {
    if (ch !== channelId) continue;
    const session = selectSession(state, gameId, now);
    if (session) out.push(session);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
