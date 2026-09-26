'use client';

/**
 * A popover anchored to a trigger that lives inside a scrolling list.
 *
 * An absolutely-positioned menu inside the message list scrolls with the
 * content, gets clipped by the list (and slides under the composer), and
 * decides "open up or down" once, when it opens. So this renders in a portal
 * with fixed coordinates measured from the anchor and re-measured on every
 * scroll and resize:
 *
 *   • it follows its trigger while the list scrolls,
 *   • it flips above/below to whichever side fits, re-deciding as it moves,
 *   • it is clamped to the viewport,
 *   • and it closes once the trigger has scrolled out of the visible part of
 *     its scroll container — a menu for a message you can no longer see is
 *     just in the way.
 */

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 8;
const GAP = 4;

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export default function FloatingPanel({
  anchorRef,
  onClose,
  children,
  prefer = 'below',
  align = 'end',
  testId,
  panelRef: externalRef,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  prefer?: 'above' | 'below';
  /** Which edge of the anchor the panel lines up with. */
  align?: 'start' | 'end';
  testId?: string;
  /** Lets the host treat clicks inside the panel as "inside". */
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; side: 'above' | 'below' } | null>(null);

  // Latest-callback: the listeners are registered once and always call the
  // current measurement (props may change while the panel is open).
  const placeRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    placeRef.current = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const a = anchor.getBoundingClientRect();
      // Scrolled out of view inside its list → the menu has nothing to point at.
      const scroller = scrollParent(anchor);
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (a.bottom < box.top || a.top > box.bottom) {
          onClose();
          return;
        }
      }
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const fitsBelow = a.bottom + GAP + h <= vh - MARGIN;
      const fitsAbove = a.top - GAP - h >= MARGIN;
      const fits = (side: 'above' | 'below') => (side === 'below' ? fitsBelow : fitsAbove);
      const other = prefer === 'below' ? 'above' : 'below';
      // Preferred side if it fits, else the other, else whichever has more room.
      const side: 'above' | 'below' = fits(prefer)
        ? prefer
        : fits(other) ? other : (a.top > vh - a.bottom ? 'above' : 'below');
      let top = side === 'below' ? a.bottom + GAP : a.top - GAP - h;
      top = Math.max(MARGIN, Math.min(top, vh - MARGIN - h));
      const rawLeft = align === 'end' ? a.right - w : a.left;
      const left = Math.max(MARGIN, Math.min(rawLeft, vw - MARGIN - w));
      setPos((prev) => (prev && prev.top === top && prev.left === left && prev.side === side ? prev : { top, left, side }));
    };
  });

  useLayoutEffect(() => {
    if (externalRef) externalRef.current = panelRef.current;
    placeRef.current();
    const panel = panelRef.current;
    const ro = typeof ResizeObserver === 'undefined' || !panel ? null : new ResizeObserver(() => placeRef.current());
    if (panel) ro?.observe(panel);
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => placeRef.current());
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      ro?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      if (externalRef) externalRef.current = null;
    };
  }, [externalRef]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      data-testid={testId}
      data-side={pos?.side}
      data-no-msg-menu
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        zIndex: 200,
        // Hidden until measured, so it never flashes at the wrong place.
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
