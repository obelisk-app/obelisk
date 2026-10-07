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

/** The sign activity to explain: a pending one first, else the latest, else none. */
export function signingEntry(activities: readonly ActivityEntry[]): ActivityEntry | null {
  return activities.find((entry) => entry.operation === 'sign' && entry.status === 'pending')
    ?? activities.find((entry) => entry.operation === 'sign')
    ?? null;
}
