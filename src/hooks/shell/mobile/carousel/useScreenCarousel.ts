'use client';

/**
 * The phone shell's horizontal carousel: the drag-tracking swipe between the
 * four top-level tabs, the tap-switch animation, the pop-to-bare-tab slide,
 * and the bookkeeping that stops a screen replaying its slide-in. The shell
 * owns `nav`, `pushNav` and `slideDir`; this hook owns the DOM-side state
 * (the drag layer, the screens host, the pending animation timer) and the
 * `suppressSlideRef` the shell consults when it renders.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { NavState } from '@/utils/shell/mobile/url-state';
import { neighborsFor } from '@/utils/shell/mobile/swipe-nav';
import { useCarouselDrag } from './useCarouselDrag';
import { useCarouselTabs } from './useCarouselTabs';

export type SlideDir = 'forward' | 'back' | null;

export interface ScreenCarouselInputs {
  readonly nav: NavState;
  readonly navRef: RefObject<NavState>;
  readonly relayRef: RefObject<string | null>;
  readonly pushNav: (updater: (n: NavState) => NavState, dir?: 'forward' | 'back') => void;
  readonly setNav: Dispatch<SetStateAction<NavState>>;
  readonly slideDir: SlideDir;
  readonly setSlideDir: Dispatch<SetStateAction<SlideDir>>;
  /** The translating layer the four tab slots sit in; its transform is set imperatively. */
  readonly dragLayerRef: RefObject<HTMLDivElement | null>;
  /** The screens host, for its width and the live `.screen-anim` element. */
  readonly screensHostRef: RefObject<HTMLDivElement | null>;
  /** Set before a push whose screen must mount without its slide-in animation. */
  readonly suppressSlideRef: RefObject<boolean>;
}

export function useScreenCarousel({
  nav, navRef, relayRef, pushNav, setNav, slideDir, setSlideDir, dragLayerRef, screensHostRef, suppressSlideRef,
}: ScreenCarouselInputs) {
  // Drag-carousel state - when the user pans horizontally, mount neighbors
  // on either side and translate the layer with the finger. `isDragging`
  // gates neighbor rendering; the layer's transform is set imperatively via
  // `dragLayerRef` to avoid re-rendering on every touchmove.
  const [isDragging, setIsDragging] = useState(false);
  // Pending animation timer for tap-switches. Rapid direct navigation (search,
  // channel row, DM row) must cancel it so the delayed tab switch cannot
  // overwrite the user's latest tap.
  const tabAnimTimerRef = useRef<number | null>(null);

  const cancelPendingTabTransition = useCallback(() => {
    if (tabAnimTimerRef.current !== null) {
      window.clearTimeout(tabAnimTimerRef.current);
      tabAnimTimerRef.current = null;
    }
    setIsDragging(false);
    const layer = dragLayerRef.current;
    if (layer) {
      layer.style.transition = 'none';
      layer.style.transform = '';
    }
  }, [dragLayerRef]);

  const { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } = useCarouselDrag({
    navRef, pushNav, dragLayerRef, screensHostRef, suppressSlideRef, setIsDragging,
  });

  // After isDragging flips back to false, reset the drag-layer transform so
  // the next render starts at translateX(0). Done in a layout effect so the
  // browser never paints the transient "screen swapped but layer still
  // translated" state.
  useLayoutEffect(() => {
    if (isDragging) return;
    const layer = dragLayerRef.current;
    if (layer) {
      layer.style.transition = 'none';
      layer.style.transform = '';
    }
    if (suppressSlideRef.current) {
      // Clear after the post-commit render commits, so a subsequent tap-nav
      // can still play its slide animation. ALSO null out slideDir so that
      // any later unrelated re-render doesn't re-add the slide-forward/back
      // class to the screen-anim wrapper and replay the slide as a ghostly
      // reverse motion.
      const id = requestAnimationFrame(() => {
        suppressSlideRef.current = false;
        setSlideDir(null);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isDragging, nav.screen, dragLayerRef, setSlideDir, suppressSlideRef]);

  // After a tap-nav slide animation completes, clear slideDir. Without this,
  // the screen-anim wrapper keeps the slide-forward/back class indefinitely,
  // and any subsequent className flip (e.g., after a drag-commit's brief ''
  // suppression) re-triggers the animation as a ghost slide.
  //
  // We listen for `animationend` on the live `.screen-anim` element rather
  // than using a fixed timer. Timers race with rapid re-navigation: a new
  // `setSlideDir(...)` while the previous animation is still in flight used
  // to leave the class on, producing the "repeated animation" glitch users
  // saw. The event-based path scopes cleanup to the actual element that
  // animated, so re-mounts (different key → fresh DOM node) get a fresh
  // listener and stale ones don't interfere. The setTimeout fallback covers
  // `prefers-reduced-motion`, hidden tabs, and other environments where
  // `animationend` may not fire reliably.
  useEffect(() => {
    if (slideDir === null) return;
    const host = screensHostRef.current;
    const el = host?.querySelector('.drag-overlay .screen-anim') as HTMLElement | null;
    const onEnd = () => setSlideDir(null);
    el?.addEventListener('animationend', onEnd, { once: true });
    const fallback = window.setTimeout(() => setSlideDir(null), 360);
    return () => {
      el?.removeEventListener('animationend', onEnd);
      clearTimeout(fallback);
    };
  }, [slideDir, nav.screen, screensHostRef, setSlideDir]);

  // ── bottom-nav: direction-aware tab switching (see useCarouselTabs) ──
  const { onTabPress } = useCarouselTabs({
    navRef, relayRef, pushNav, setNav, setSlideDir, dragLayerRef, screensHostRef, suppressSlideRef, tabAnimTimerRef, setIsDragging,
  });

  const dragNeighbors = useMemo(() => neighborsFor(nav), [nav]);

  return {
    isDragging,
    cancelPendingTabTransition,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onTabPress,
    dragNeighbors,
  };
}
