'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Fire `handler` when a mousedown lands outside `ref`, and optionally when
 * Escape is pressed. The ~16 pickers / dropdowns / menus in the app that
 * close on outside-click all used the same hand-rolled effect — this
 * collapses that boilerplate into one call.
 *
 * `enabled: false` tears the listeners down, so callers with conditional
 * open-state (most of them) don't have to wrap the hook in an `if (open)`.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  options: { escape?: boolean; enabled?: boolean } = {},
): void {
  const { escape = false, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handler();
    }

    document.addEventListener('mousedown', onMouseDown);
    if (escape) document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      if (escape) document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, handler, escape, enabled]);
}
