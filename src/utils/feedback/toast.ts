import { TOAST_AUTO_DISMISS_MS } from '@/constants/feedback/toast';

/** The time a toast has left, counted from when it was pushed, never negative. */
export function toastRemainingMs(createdAt: number, now: number, durationMs = TOAST_AUTO_DISMISS_MS): number {
  return Math.max(0, durationMs - (now - createdAt));
}
