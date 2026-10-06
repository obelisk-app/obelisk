import type { NavState, ScreenName } from './url-state';
import { resolveParent } from './swipe-nav';

export type SlotRole = 'drag-curr' | 'drag-prev' | 'drag-next' | 'drag-hidden';

/**
 * Where a persistently-mounted top-level tab sits in the carousel.
 *
 * When the active screen is a sub-screen overlay, its parent top-level tab
 * sits at translateX(0) behind the overlay so the user sees the overlay
 * slide in over it. The parent is *not* a drag neighbor anymore, horizontal
 * swipes skip past the parent in both directions to switch tabs (see
 * swipe-nav.ts), so it stays at drag-curr regardless of drag state. The
 * actual neighbors revealed by a drag are the previous/next top-level tabs
 * around the parent.
 */
export function slotRoleFor(
  slot: ScreenName,
  nav: NavState,
  neighbors: { left: ScreenName | null; right: ScreenName | null },
): SlotRole {
  const subScreenParent = resolveParent(nav);
  return slot === nav.screen
    ? 'drag-curr'
    : slot === subScreenParent
    ? 'drag-curr'
    : slot === neighbors.left
    ? 'drag-prev'
    : slot === neighbors.right
    ? 'drag-next'
    : 'drag-hidden';
}

/**
 * Sheet screens (msg-actions / zap-modal) render the underlying screen as the
 * body so the sub-overlay slot stays mounted. The key for that slot is
 * derived from `baseScreen` so opening/closing a sheet doesn't remount the
 * underlying screen and lose its local state.
 */
export function overlayScreenKeyFor(nav: NavState): ScreenName {
  return nav.screen === 'msg-actions' || nav.screen === 'zap-modal'
    ? (nav.baseScreen ?? 'channel')
    : nav.screen;
}

/** The slide-in class for the overlay; `suppress` mounts it without one. */
export function slideClassFor(suppress: boolean, slideDir: 'forward' | 'back' | null): string {
  return suppress
    ? ''
    : slideDir === 'forward' ? 'slide-forward' : slideDir === 'back' ? 'slide-back' : '';
}

/** The carousel's slide: 180ms, eased out. */
export const CAROUSEL_TRANSITION = 'transform 180ms cubic-bezier(0.2, 0.85, 0.25, 1)';

/**
 * Which way a touch is going once it has moved far enough to tell: under
 * 8px either way it is still undecided (`null`); horizontal only when
 * |dx| > 1.2×|dy|, so a clean vertical scroll is left alone.
 */
export function swipeAxis(dx: number, dy: number): 'horizontal' | 'vertical' | null {
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.2 ? 'horizontal' : 'vertical';
}

/** Rubber-band (30%) when there is no neighbor on the side being pulled from. */
export function rubberBandDx(
  dx: number,
  neighbors: { left: ScreenName | null; right: ScreenName | null },
): number {
  if (dx > 0 && !neighbors.left) return dx * 0.3;
  if (dx < 0 && !neighbors.right) return dx * 0.3;
  return dx;
}
