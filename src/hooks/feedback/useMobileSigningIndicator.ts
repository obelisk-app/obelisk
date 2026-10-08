import { useActivityLog } from '@/hooks/feedback/useActivityLog';
import type { ActivityEntry } from '@/services/feedback/activity-log';
import { signingEntry } from '@/utils/feedback/activity';

export type SigningStatus = ActivityEntry['status'] | 'idle';

const DOT_CLASS: Record<SigningStatus, string> = {
  pending: 'bg-amber-400 animate-pulse',
  ok: 'bg-lc-green',
  error: 'bg-red-500',
  // Idle is healthy: nothing is waiting on the signer.
  idle: 'bg-lc-green',
};

/**
 * The phone top bar's signer dot: the sign activity it explains, its status
 * and the dot's colour (docs/ui/conventions.md#component-files).
 */
export function useMobileSigningIndicator() {
  const signing = signingEntry(useActivityLog());
  const status: SigningStatus = signing?.status ?? 'idle';
  return { signing, status, dotClass: DOT_CLASS[status] };
}
