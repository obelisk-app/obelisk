import { useActivityLog } from '@/hooks/feedback/useActivityLog';
import type { ActivityEntry } from '@/services/feedback/activity-log';

export type SigningStatus = ActivityEntry['status'] | 'idle';

/** The sign activity to explain: a pending one first, else the latest, else none. */
export function signingEntry(activities: readonly ActivityEntry[]): ActivityEntry | null {
  return activities.find((entry) => entry.operation === 'sign' && entry.status === 'pending')
    ?? activities.find((entry) => entry.operation === 'sign')
    ?? null;
}

const DOT_CLASS: Record<SigningStatus, string> = {
  pending: 'bg-amber-400 animate-pulse',
  ok: 'bg-lc-green',
  error: 'bg-red-500',
  // Idle is healthy: nothing is waiting on the signer.
  idle: 'bg-lc-green',
};

/**
 * The phone top bar's signer dot: the sign activity it explains, its status
 * and the dot's colour (docs/conventions.md#component-files).
 */
export function useMobileSigningIndicator() {
  const signing = signingEntry(useActivityLog());
  const status: SigningStatus = signing?.status ?? 'idle';
  return { signing, status, dotClass: DOT_CLASS[status] };
}
