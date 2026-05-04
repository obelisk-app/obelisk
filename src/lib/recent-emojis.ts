// Persist most-recently-used emojis in localStorage for the picker.
// MRU-ordered, capped at MAX. Safe to call during SSR (returns []).

const KEY = 'obelisk:recent-emojis';
const MAX = 24;

export function loadRecentEmojis(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveRecentEmojis(list: ReadonlyArray<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function pushRecentEmoji(emoji: string): string[] {
  const prev = loadRecentEmojis();
  const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, MAX);
  saveRecentEmojis(next);
  return next;
}
