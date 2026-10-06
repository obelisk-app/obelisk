const HISTORY_KEY = 'obelisk-dex/search-history';
const HISTORY_MAX = 10;

export function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, HISTORY_MAX) : [];
  } catch { return []; }
}

/** Put `q` at the top of the remembered queries (deduped, capped) and return the new list. */
export function pushHistory(q: string): string[] {
  const trimmed = q.trim();
  const cur = loadHistory().filter((x) => x !== trimmed);
  if (!trimmed || typeof window === 'undefined') return cur;
  const next = [trimmed, ...cur].slice(0, HISTORY_MAX);
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

export function wipeHistory() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}
