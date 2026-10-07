import { useActivityLog } from '@/hooks/feedback/useActivityLog';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import type { ActivityEntry } from '@/services/feedback/activity-log';

/**
 * The one activity row to show, or none. Only one row shows, to avoid a
 * stack of notifications. A pending "Waiting for ... signature" always wins
 * over anything else: the person is looking at an extension or bunker
 * prompt and needs to know the app is blocked on them, even when a later
 * activity (say "Publishing to relays") was pushed after the sign waiter.
 */
export function visibleActivity(
  items: readonly ActivityEntry[],
  { show, hideSigning }: { show: boolean; hideSigning: boolean },
): ActivityEntry[] {
  if (!show || hideSigning) return [];
  const pendingSign = items.find((e) => e.status === 'pending' && e.operation === 'sign');
  return pendingSign ? [pendingSign] : items.slice(0, 1);
}

/**
 * The desktop activity stack's view model: the row to show from the
 * activity log, honouring the "show activity" preference
 * (docs/conventions.md#component-files).
 */
export function useActivityIndicator(hideSigning: boolean): ActivityEntry[] {
  const items = useActivityLog();
  const { showActivityIndicator } = usePreferences();
  return visibleActivity(items, { show: showActivityIndicator, hideSigning });
}
