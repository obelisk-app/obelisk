/**
 * Step back in the browser history. The phone member list closes this way,
 * so the history sync (`useMobileHistorySync`) restores whatever was under
 * it, from any entry point.
 */
export function historyBack(): void {
  if (typeof window !== 'undefined') window.history.back();
}
