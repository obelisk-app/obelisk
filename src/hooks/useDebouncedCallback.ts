'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Wrap `callback` so consecutive calls coalesce into a single deferred run
 * `delayMs` after the last call. `cancel` discards a pending call (useful
 * when the user submits early or the debounced action is no longer valid).
 *
 * The latest `callback` closure always wins: consumers can pass inline
 * arrow functions without worrying about stale captures.
 *
 * Any pending timeout is cleared on unmount.
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs: number,
): { run: (...args: A) => void; cancel: () => void } {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { callbackRef.current = callback; });
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const run = useCallback((...args: A) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      callbackRef.current(...args);
    }, delayMs);
  }, [delayMs]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { run, cancel };
}
