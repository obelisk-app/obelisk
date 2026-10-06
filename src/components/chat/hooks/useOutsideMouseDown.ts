'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Superseded by `useDismiss` (`src/hooks/useDismiss.ts`): no call site in
 * this folder uses this any more. It stays only until it and its test can
 * be removed together.
 *
 * Call `onOutside` on a `mousedown` outside `ref` while `enabled`: the
 * dismiss rule every popover in this folder used (picker, attachment menu,
 * sort menu). `mousedown`, not `click`, so the press that opens something
 * else closes this first. `touch` also listens for `touchstart`, for a
 * popover a phone opens with a tap.
 */
export function useOutsideMouseDown(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean,
  touch = false,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onDoc = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', onDoc);
    if (touch) document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      if (touch) document.removeEventListener('touchstart', onDoc);
    };
  }, [ref, onOutside, enabled, touch]);
}
