/**
 * The call session (`session.ts`: WebRTC, `simple-peer`, local capture) is
 * its own download, fetched the first time a call needs it.
 *
 * Nothing about *hearing* a call needs it: the invite arrives as a gift
 * wrapped DM, and ringing is the notification stack. So the store imports
 * only this loader, and a page where nobody calls never fetches the media
 * stack at all. It is fetched:
 *
 * - when the user starts a call (and a little earlier, when the pointer
 *   reaches the call buttons, see `prefetchDmCallSession`);
 * - when an invite starts ringing, so it is usually in place before the
 *   user can reach "Accept".
 *
 * A failed fetch is not remembered: the next call tries again.
 *
 * `tests/app/app/lazy-mounts.test.tsx` fails if the shell reaches
 * `session.ts` or `simple-peer` through a static import again.
 */
import type * as SessionModule from './session';

let pending: Promise<typeof SessionModule> | null = null;

export function loadDmCallSession(): Promise<typeof SessionModule> {
  if (!pending) {
    pending = import('./session').catch((err: unknown) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

/** Start the download without waiting for it. Errors surface on the real load. */
export function prefetchDmCallSession(): void {
  loadDmCallSession().catch(() => {});
}
