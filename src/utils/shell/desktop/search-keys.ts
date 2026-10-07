/** What a key does in the desktop search bar, or `null` to let it type. */
export type SearchBarKeyAction =
  | { kind: 'clear' }
  | { kind: 'close' }
  | { kind: 'move'; delta: 1 | -1 }
  | { kind: 'jump'; index: number };

/**
 * Escape clears the query, then closes the pane; with results showing the
 * arrows move the highlight and Enter opens the highlighted hit.
 */
export function searchBarKeyAction(key: string, raw: string, resultCount: number, activeIndex: number): SearchBarKeyAction | null {
  if (key === 'Escape') return raw ? { kind: 'clear' } : { kind: 'close' };
  if (resultCount === 0) return null;
  if (key === 'ArrowDown') return { kind: 'move', delta: 1 };
  if (key === 'ArrowUp') return { kind: 'move', delta: -1 };
  if (key === 'Enter' && activeIndex >= 0) return { kind: 'jump', index: activeIndex };
  return null;
}
