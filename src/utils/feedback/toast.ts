/** How long a toast stays up. */
export const TOAST_AUTO_DISMISS_MS = 5000;

/** The time a toast has left, counted from when it was pushed, never negative. */
export function toastRemainingMs(createdAt: number, now: number): number {
  return Math.max(0, TOAST_AUTO_DISMISS_MS - (now - createdAt));
}
