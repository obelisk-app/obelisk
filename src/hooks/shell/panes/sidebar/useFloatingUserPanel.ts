'use client';

import { useEffect, useRef } from 'react';

/** Read by the channel and DM lists' bottom padding (`Sidebar`, `DmList`). */
const CLEARANCE_VAR = '--floating-user-panel-clearance';

/**
 * The desktop `FloatingUserPanel` floats over the foot of the channel (or DM)
 * list. A fixed padding guess under-reserved whenever the pill grew (a second
 * line, a call bar), so the last channels sat under the panel and a click
 * there landed on it. This measures how much of the shell the panel covers,
 * from its top edge to the shell's bottom, and publishes it on the shell as
 * `--floating-user-panel-clearance`, kept current as either resizes.
 */
export function useFloatingUserPanel() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = ref.current;
    const host = panel?.parentElement;
    if (!panel || !host) return;
    const measure = () => {
      const rect = panel.getBoundingClientRect();
      // Hidden (the phone layout): nothing to clear, fall back to the default.
      if (rect.height === 0) {
        host.style.removeProperty(CLEARANCE_VAR);
        return;
      }
      const clearance = Math.max(0, Math.ceil(host.getBoundingClientRect().bottom - rect.top));
      host.style.setProperty(CLEARANCE_VAR, `${clearance}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return () => host.style.removeProperty(CLEARANCE_VAR);
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(host);
    return () => {
      observer.disconnect();
      host.style.removeProperty(CLEARANCE_VAR);
    };
  }, []);
  return ref;
}
