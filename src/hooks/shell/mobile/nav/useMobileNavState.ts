'use client';

import { useCallback, useRef, useState } from 'react';
import { type NavState, initialNav, urlFor } from '@/utils/shell/mobile/url-state';
import type { SlideDir } from '../carousel/useScreenCarousel';

/**
 * The phone shell's navigation state: where it is (`nav`, mirrored in
 * `navRef` for handlers that must not wait for a render), which way the
 * screen slides in, and `pushNav`, the one way forward.
 */
export function useMobileNavState(currentRelayUrl: string | null | undefined) {
  const [nav, setNav] = useState<NavState>(initialNav);
  const navRef = useRef<NavState>(initialNav);
  const relayRef = useRef<string | null>(currentRelayUrl ?? null);
  // Slide direction for the screen-mount animation. 'forward' slides in
  // from the right (push), 'back' slides in from the left (pop). Cleared
  // after each animation so a same-screen rerender doesn't replay.
  const [slideDir, setSlideDir] = useState<SlideDir>(null);

  // Push a new nav state into the browser history. The popstate handler is
  // the single mechanism for "back", every back-button (device, browser,
  // swipe-back) pops one entry, and the listener replays the previous nav.
  const pushNav = useCallback((updater: (n: NavState) => NavState, dir: 'forward' | 'back' = 'forward') => {
    setSlideDir(dir);
    setNav((n) => {
      const next = updater(n);
      navRef.current = next;
      if (typeof window !== 'undefined') {
        try {
          window.history.pushState({ nav: next }, '', urlFor(next, relayRef.current));
        } catch { /* ignore */ }
      }
      return next;
    });
  }, []);

  return { nav, setNav, navRef, relayRef, slideDir, setSlideDir, pushNav };
}
