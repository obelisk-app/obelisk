'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** setTimeout treats anything past 2^31-1 ms as 0 and fires at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Whether the wall clock has passed `expiresAt` (unix seconds), as a
 * subscription to the clock rather than a `Date.now()` read in render.
 *
 * Reading the clock during render made the caller impure, and the practical
 * cost was that an invoice only noticed it had expired when something else
 * happened to re-render it. Arming one timer at the expiry instant means the
 * flip to "expired" lands on time. Expired is `expiresAt < floor(now / 1000)`,
 * the comparison the render used to make. On the server it is always false.
 */
export function useHasExpired(expiresAt: number | undefined): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (!expiresAt) return () => {};
    let id: number | undefined;
    const arm = () => {
      const delay = (expiresAt + 1) * 1000 - Date.now();
      if (delay <= 0) {
        notify();
        return;
      }
      id = window.setTimeout(delay > MAX_TIMEOUT_MS ? arm : notify, Math.min(delay, MAX_TIMEOUT_MS));
    };
    arm();
    return () => {
      if (id !== undefined) window.clearTimeout(id);
    };
  }, [expiresAt]);
  const getSnapshot = useCallback(
    () => !!expiresAt && expiresAt < Math.floor(Date.now() / 1000),
    [expiresAt],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
