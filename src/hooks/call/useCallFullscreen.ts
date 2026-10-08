'use client';

import { useEffect, useState } from 'react';
import { useDismiss } from '@/hooks/common/useDismiss';

/**
 * Fullscreen for the call view. Uses the Fullscreen API on the view itself
 * (true fullscreen, the browser chrome goes away); where that isn't available
 * (iOS Safari only allows it on `<video>`) the view just fills the window.
 * Esc leaves either way, and unmounting never leaves the page stuck in
 * fullscreen.
 */
export function useCallFullscreen(ref: React.RefObject<HTMLDivElement | null>) {
  const [native, setNative] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === ref.current && ref.current !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);
  useDismiss({ enabled: expanded, outside: 'none', onDismiss: () => setExpanded(false) });
  // Leaving the call must not leave the page stuck in fullscreen.
  useEffect(() => () => {
    if (typeof document !== 'undefined' && document.fullscreenElement && document.fullscreenElement === ref.current) {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, [ref]);
  const toggle = () => {
    const el = ref.current;
    if (native) {
      void document.exitFullscreen?.().catch(() => {});
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (el && typeof el.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
      el.requestFullscreen().catch(() => setExpanded(true));
    } else {
      setExpanded(true);
    }
  };
  return { full: native || expanded, toggle };
}
