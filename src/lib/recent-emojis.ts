// Persist most-recently-used emojis in localStorage for the picker.
// MRU-ordered, capped at MAX. Safe to call during SSR (returns []).

import { createLocalStore } from './local-store';

const MAX = 24;

const store = createLocalStore<string[]>('obelisk:recent-emojis', []);

export function loadRecentEmojis(): string[] {
  const raw = store.load();
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string').slice(0, MAX);
}

export function saveRecentEmojis(list: ReadonlyArray<string>): void {
  store.save([...list.slice(0, MAX)]);
}

export function pushRecentEmoji(emoji: string): string[] {
  const prev = loadRecentEmojis();
  const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, MAX);
  saveRecentEmojis(next);
  return next;
}
