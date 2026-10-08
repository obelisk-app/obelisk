import { createLocalStore } from '@/services/common/local-store';

const store = createLocalStore<string[]>('obelisk-dex/search-history', []);
const HISTORY_MAX = 10;

export function loadHistory(): string[] {
  const value = store.load();
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string').slice(0, HISTORY_MAX) : [];
}

/** Put `q` at the top of the remembered queries (deduped, capped) and return the new list. */
export function pushHistory(q: string): string[] {
  const trimmed = q.trim();
  const cur = loadHistory().filter((x) => x !== trimmed);
  if (!trimmed || typeof window === 'undefined') return cur;
  const next = [trimmed, ...cur].slice(0, HISTORY_MAX);
  store.save(next);
  return next;
}

export function wipeHistory() {
  store.remove();
}
