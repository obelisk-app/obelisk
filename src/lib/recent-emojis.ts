// Persist most-recently-used emojis in localStorage for the picker.
// MRU-ordered, capped at MAX. Safe to call during SSR (returns []).
//
// Custom (image-backed) picks remember their URL: a shortcode alone cannot be
// resolved back to media once it leaves the active relay's emoji set — or when
// it never was in it, as with GIFs and stickers picked from the media picker —
// and the recents grid would then print `:party_cat:` as text instead of
// rendering the media. Legacy string-only entries still load.

import { createLocalStore } from './local-store';

const MAX = 24;

export interface RecentEmoji {
  /** Unicode char, or `:shortcode:` for custom media. */
  readonly char: string;
  /** Image URL — present for custom media picks. */
  readonly url?: string;
  readonly packAddress?: string;
}

type StoredRecent = string | RecentEmoji;

const store = createLocalStore<StoredRecent[]>('obelisk:recent-emojis', []);

function normalize(entry: StoredRecent): RecentEmoji | null {
  if (typeof entry === 'string') return entry ? { char: entry } : null;
  if (!entry || typeof entry.char !== 'string' || !entry.char) return null;
  if (typeof entry.url !== 'string' || !entry.url) return { char: entry.char };
  return {
    char: entry.char,
    url: entry.url,
    ...(typeof entry.packAddress === 'string' && entry.packAddress ? { packAddress: entry.packAddress } : {}),
  };
}

export function loadRecentEmojis(): RecentEmoji[] {
  const raw = store.load();
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalize)
    .filter((entry): entry is RecentEmoji => entry !== null)
    .slice(0, MAX);
}

export function saveRecentEmojis(list: ReadonlyArray<RecentEmoji>): void {
  store.save(list.slice(0, MAX).map((entry) => (entry.url ? { ...entry } : entry.char)));
  snapshot = list.slice(0, MAX);
  listeners.forEach((l) => l());
}

// -- reactive snapshot ----------------------------------------------------
// Every message row's quick-reaction bar reads the recents; one shared
// snapshot (refreshed on save) instead of a localStorage parse per row.

let snapshot: RecentEmoji[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: RecentEmoji[] = [];

export function getRecentEmojisSnapshot(): RecentEmoji[] {
  if (snapshot === null) snapshot = typeof window === 'undefined' ? EMPTY : loadRecentEmojis();
  return snapshot;
}

export function getServerRecentEmojisSnapshot(): RecentEmoji[] {
  return EMPTY;
}

export function subscribeRecentEmojis(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Default quick reactions, used to fill the bar until the user has recents. */
export const DEFAULT_QUICK_REACTIONS: ReadonlyArray<RecentEmoji> = [
  { char: '🔥' }, { char: '⚡' }, { char: '😂' }, { char: '🤔' },
];

/** The first `n` distinct recents, padded with the defaults. */
export function quickReactions(recent: ReadonlyArray<RecentEmoji>, n: number): RecentEmoji[] {
  const out: RecentEmoji[] = [];
  for (const e of [...recent, ...DEFAULT_QUICK_REACTIONS]) {
    if (out.length >= n) break;
    if (!out.some((x) => x.char === e.char)) out.push(e);
  }
  return out;
}

/** Test seam. */
export function __resetRecentEmojiSnapshotForTests(): void {
  snapshot = null;
}

export function pushRecentEmoji(
  char: string,
  media?: { readonly url: string; readonly packAddress?: string },
): RecentEmoji[] {
  const entry: RecentEmoji = media?.url
    ? { char, url: media.url, ...(media.packAddress ? { packAddress: media.packAddress } : {}) }
    : { char };
  const next = [entry, ...loadRecentEmojis().filter((value) => value.char !== char)].slice(0, MAX);
  saveRecentEmojis(next);
  return next;
}
