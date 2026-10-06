import { useEffect, useState } from 'react';

/**
 * Returns the current on-screen keyboard inset in CSS px, computed from
 * `window.visualViewport`. Returns 0 when the keyboard is closed, when
 * the API is unavailable (SSR, jsdom, older browsers), or when the inset
 * is too small to be a real keyboard (browser-chrome reflow).
 *
 * Hysteresis: opens past 150px, stays open until below 80px. This keeps
 * the boolean derived from `inset > 0` from flickering during the keyboard
 * animation, which fires ~10–20 resize events on iOS.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    let last = 0;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const open = last > 0 ? kb > 80 : kb > 150;
      const next = open ? Math.round(kb) : 0;
      if (next !== last) {
        last = next;
        setInset(next);
      }
    };
    vv.addEventListener('resize', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
    };
  }, []);
  return inset;
}
