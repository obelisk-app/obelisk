'use client';

/**
 * Horizontal swipe navigation (drag-tracking carousel).
 *
 * The user pans horizontally; the active screen translates with the finger
 * and the neighboring screen reveals from the side. On release we either
 * commit (if dragged ≥ ⅓ viewport, or flicked with enough velocity) or
 * snap back. Touches that start inside another horizontal scroller (relay
 * strip, tab strips) are ignored so those keep their own scroll behavior.
 * Vertical scrollers (`.messages`, voice stage) are NOT excluded, the
 * direction-detection below commits to 'horizontal' only when |dx| > 1.2×|dy|
 * so a clean vertical scroll is left alone.
 */
import { useCallback, useRef, type RefObject } from 'react';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/chat/dm';
import type { NavState } from '@/utils/shell/mobile/url-state';
import { initialNav, CAROUSEL_TRANSITION } from '@/constants/shell/mobile';
import { decideSnap, decideSwipeNav, neighborsFor } from '@/utils/shell/mobile/swipe-nav';
import { shouldIgnoreMobileSwipeTarget } from '@/utils/shell/mobile/swipe-target';
import { rubberBandDx, swipeAxis } from '@/utils/shell/mobile/carousel-slots';

type DragInfo = {
  startX: number;
  startY: number;
  startT: number;
  width: number;
  ignored: boolean;
  decided: 'horizontal' | 'vertical' | null;
  dx: number;
  velocity: number; // px/ms at last move
  lastX: number;
  lastT: number;
};

export interface CarouselDragInputs {
  readonly navRef: RefObject<NavState>;
  readonly pushNav: (updater: (n: NavState) => NavState, dir?: 'forward' | 'back') => void;
  readonly dragLayerRef: RefObject<HTMLDivElement | null>;
  readonly screensHostRef: RefObject<HTMLDivElement | null>;
  readonly suppressSlideRef: RefObject<boolean>;
  readonly setIsDragging: (dragging: boolean) => void;
}

export function useCarouselDrag({
  navRef, pushNav, dragLayerRef, screensHostRef, suppressSlideRef, setIsDragging,
}: CarouselDragInputs) {
  const dragRef = useRef<DragInfo | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) { dragRef.current = null; return; }
    const t = e.touches[0];
    const ignored = shouldIgnoreMobileSwipeTarget(e.target);
    const width = screensHostRef.current?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
    const now = Date.now();
    dragRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      startT: now,
      width,
      ignored,
      decided: null,
      dx: 0,
      velocity: 0,
      lastX: t.clientX,
      lastT: now,
    };
  }, [screensHostRef]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.ignored) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.startX;
    const dy = t.clientY - drag.startY;
    const now = Date.now();
    const dtSinceLast = Math.max(1, now - drag.lastT);
    drag.velocity = (t.clientX - drag.lastX) / dtSinceLast;
    drag.lastX = t.clientX;
    drag.lastT = now;
    drag.dx = dx;
    if (drag.decided === null) {
      // Wait for enough movement to disambiguate intent. Then commit to one
      // axis: horizontal (drag the carousel) or vertical (let the scroller
      // inside the screen own the gesture).
      const axis = swipeAxis(dx, dy);
      if (axis === null) return;
      drag.decided = axis;
      if (axis === 'horizontal') setIsDragging(true);
    }
    if (drag.decided !== 'horizontal') return;
    // Rubber-band when there's no neighbor on the side we're pulling from.
    const displayDx = rubberBandDx(dx, neighborsFor(navRef.current));
    const layer = dragLayerRef.current;
    if (layer) {
      layer.style.transition = 'none';
      layer.style.transform = `translateX(${displayDx}px)`;
    }
  }, [dragLayerRef, navRef, setIsDragging]);

  const finishDrag = useCallback((dx: number, velocity: number, width: number) => {
    const goingRight = dx > 0;
    const action = decideSwipeNav(navRef.current, goingRight);
    const hasTarget = action.kind === 'top-level';
    const snap = hasTarget ? decideSnap(dx, velocity, width) : 'revert';
    const layer = dragLayerRef.current;
    if (snap === 'commit' && action.kind === 'top-level') {
      // Animate first, push after. Top-level tab switches always land on the
      // actual tab, not a remembered thread/channel/voice room.
      const targetTx = goingRight ? width : -width;
      if (layer) {
        layer.style.transition = CAROUSEL_TRANSITION;
        layer.style.transform = `translateX(${targetTx}px)`;
      }

      window.setTimeout(() => {
        suppressSlideRef.current = true;
        useChatStore.setState({ activeChannelId: null });
        useDMStore.setState({ activeDMPubkey: null });
        pushNav(
          () => ({ ...initialNav, screen: action.target }),
          action.dir,
        );
        setIsDragging(false);
      }, 180);
    } else {
      if (layer) {
        layer.style.transition = CAROUSEL_TRANSITION;
        layer.style.transform = 'translateX(0)';
      }
      window.setTimeout(() => {
        setIsDragging(false);
      }, 180);
    }
  }, [pushNav, dragLayerRef, navRef, suppressSlideRef, setIsDragging]);

  const onTouchEnd = useCallback((_e: React.TouchEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.ignored) return;
    if (drag.decided !== 'horizontal') return;
    finishDrag(drag.dx, drag.velocity, drag.width);
  }, [finishDrag]);

  const onTouchCancel = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.ignored || drag.decided !== 'horizontal') return;
    // Treat cancel as revert.
    finishDrag(0, 0, drag.width);
  }, [finishDrag]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
