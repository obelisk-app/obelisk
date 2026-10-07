import { useEffect, useRef, type RefObject } from 'react';

/**
 * Which press outside counts as "dismiss".
 * - `mousedown`: the classic menu rule (fires before focus moves).
 * - `pointerdown`: also catches pen and touch in one listener.
 * - `none`: only Escape dismisses (a modal, whose backdrop click is its own).
 */
export type DismissOutside = 'mousedown' | 'pointerdown' | 'none';
/** `close`: Escape dismisses. `ignore`: Escape is left to someone else. */
export type DismissEscape = 'close' | 'ignore';

export interface DismissOptions {
  /** Everything that counts as "inside": the panel, and usually its trigger. */
  refs?: ReadonlyArray<RefObject<HTMLElement | null>>;
  onDismiss: () => void;
  /** Listen only while this is true (the panel is open). Default true. */
  enabled?: boolean;
  outside?: DismissOutside;
  escape?: DismissEscape;
}

/**
 * Close on a press outside `refs` and on Escape: the one implementation of
 * what 13 hand-rolled click-outside listeners and 17 Escape listeners did,
 * each slightly differently.
 *
 * `onDismiss` is read through a ref, so a new callback every render does not
 * re-register the listeners.
 */
export function useDismiss({
  refs = [],
  onDismiss,
  enabled = true,
  outside = 'mousedown',
  escape = 'close',
}: DismissOptions): void {
  const latest = useRef(onDismiss);
  const inside = useRef(refs);
  useEffect(() => {
    latest.current = onDismiss;
    inside.current = refs;
  });

  useEffect(() => {
    if (!enabled || outside === 'none') return;
    const onPress = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (inside.current.some((ref) => ref.current?.contains(target))) return;
      latest.current();
    };
    document.addEventListener(outside, onPress);
    return () => document.removeEventListener(outside, onPress);
  }, [enabled, outside]);

  useEffect(() => {
    if (!enabled || escape === 'ignore') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, escape]);
}
