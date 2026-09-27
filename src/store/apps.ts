/**
 * Client state for app sessions (games, polls, boards — whatever an app is).
 *
 * The store holds the raw kind 2390 event log per session and nothing derived.
 * The host only needs a summary (which app, who's in, closed or not, the card
 * line), recomputed from the log on read and cached by the log array's
 * identity; the app's own state is replayed by the app inside its sandbox from
 * the same events.
 *
 * Carried over from `store/games.ts`: copy-on-write logs so a new event makes a
 * new array (and old memo keys simply become unreachable), a module-level seen
 * set for O(1) dedupe, batched ingest.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { create } from 'zustand';

import { sessionIdOf, summarizeSession, WAITING_EXPIRY_S, type SessionSummary } from '@/lib/apps/session';

interface AppsStore {
  /** sessionId → its events, unsorted. */
  logs: Record<string, NostrEvent[]>;
  /** sessionId → channelId. */
  channelOf: Record<string, string>;
  /** The session open in the app frame, if any. */
  openSessionId: string | null;

  ingestMany: (evs: readonly NostrEvent[]) => void;
  clearChannel: (channelId: string) => void;
  setOpenSession: (sessionId: string | null) => void;
  reset: () => void;
}

const seen = new Set<string>();

export const useAppsStore = create<AppsStore>((set) => ({
  logs: {},
  channelOf: {},
  openSessionId: null,

  ingestMany: (evs) => set((s) => mergeEvents(s, evs)),

  clearChannel: (channelId) => set((s) => {
    const logs = { ...s.logs };
    const channelOf = { ...s.channelOf };
    for (const [sid, ch] of Object.entries(s.channelOf)) {
      if (ch !== channelId) continue;
      for (const ev of logs[sid] ?? []) seen.delete(ev.id);
      delete logs[sid];
      delete channelOf[sid];
    }
    return { logs, channelOf };
  }),

  setOpenSession: (sessionId) => set({ openSessionId: sessionId }),

  reset: () => {
    seen.clear();
    set({ logs: {}, channelOf: {}, openSessionId: null });
  },
}));

function mergeEvents(
  s: { logs: Record<string, NostrEvent[]>; channelOf: Record<string, string> },
  evs: readonly NostrEvent[],
): Partial<AppsStore> {
  let fresh: Map<string, NostrEvent[]> | null = null;
  let channelOf: Record<string, string> | null = null;

  for (const ev of evs) {
    if (seen.has(ev.id)) continue;
    const sid = sessionIdOf(ev);
    if (!sid) continue;
    seen.add(ev.id);
    fresh = fresh ?? new Map();
    const bucket = fresh.get(sid);
    if (bucket) bucket.push(ev);
    else fresh.set(sid, [ev]);
    const ch = ev.tags.find((t) => t[0] === 'h')?.[1];
    if (ch && s.channelOf[sid] !== ch) {
      channelOf = channelOf ?? { ...s.channelOf };
      channelOf[sid] = ch;
    }
  }
  if (!fresh) return {};

  const logs = { ...s.logs };
  for (const [sid, added] of fresh) logs[sid] = [...(s.logs[sid] ?? []), ...added];
  return channelOf ? { logs, channelOf } : { logs };
}

const SUMMARY = new WeakMap<readonly NostrEvent[], SessionSummary | null>();

/** The session's summary, or null until its (valid) `create` has arrived. */
export function selectSummary(state: { logs: Record<string, NostrEvent[]> }, sessionId: string): SessionSummary | null {
  const log = state.logs[sessionId];
  if (!log || log.length === 0) return null;
  let s = SUMMARY.get(log);
  if (s === undefined) {
    s = summarizeSession(log);
    if (s && process.env.NODE_ENV !== 'production') Object.freeze(s);
    SUMMARY.set(log, s);
  }
  return s;
}

/**
 * A card's read of whether a session is still worth opening. Apps decide their
 * own ending; the host only knows "cancelled" and "went quiet". Nothing for an
 * hour since creation with only the creator in it = stale (dex games' rule).
 */
export function isStale(s: SessionSummary, now = Math.floor(Date.now() / 1000)): boolean {
  return s.participants.length <= 1 && s.lastActivity === s.createdAt && now - s.createdAt > WAITING_EXPIRY_S;
}
