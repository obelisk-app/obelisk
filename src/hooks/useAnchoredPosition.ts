import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  placePopover,
  type PopoverAlign,
  type PopoverPlacement,
  type PopoverSide,
} from '@/components/ui/popover-position';

/**
 * What a popover does when the page under it scrolls or resizes.
 * - `track`: re-measure and follow the anchor, re-deciding the side, and
 *   close once the anchor has scrolled out of its own scroll container (a
 *   menu for a message you can no longer see is just in the way).
 * - `close`: the coordinates are a snapshot, so close rather than drift.
 */
export type PopoverFollow = 'track' | 'close';

export interface AnchoredPositionOptions {
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  prefer: PopoverSide;
  align: PopoverAlign;
  follow: PopoverFollow;
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Fixed-position coordinates for a panel next to its anchor. Returns `null`
 * until the panel has been measured, so the caller can keep it hidden and
 * it never flashes at the wrong place.
 */
export function useAnchoredPosition({
  anchorRef,
  panelRef,
  open,
  onClose,
  prefer,
  align,
  follow,
}: AnchoredPositionOptions): PopoverPlacement | null {
  const [pos, setPos] = useState<PopoverPlacement | null>(null);
  // Forget the placement as soon as the panel closes, so the next open
  // starts hidden until it has been measured again.
  if (!open && pos) setPos(null);

  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; });

  // Latest-callback: the listeners are registered once and always call the
  // current measurement (props may change while the panel is open).
  const placeRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    placeRef.current = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const a = anchor.getBoundingClientRect();
      if (follow === 'track') {
        const scroller = scrollParent(anchor);
        if (scroller) {
          const box = scroller.getBoundingClientRect();
          if (a.bottom < box.top || a.top > box.bottom) {
            onClose();
            return;
          }
        }
      }
      const next = placePopover({
        anchor: a,
        width: panel.offsetWidth,
        height: panel.offsetHeight,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        prefer,
        align,
      });
      setPos((prev) => (prev && prev.top === next.top && prev.left === next.left && prev.side === next.side ? prev : next));
    };
    // Measure on every commit while open: the content may have changed size.
    if (open) placeRef.current();
  });

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const ro = typeof ResizeObserver === 'undefined' || !panel ? null : new ResizeObserver(() => placeRef.current());
    if (panel) ro?.observe(panel);
    let frame = 0;
    const onMove = follow === 'track'
      ? () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => placeRef.current());
      }
      : () => onCloseRef.current();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      ro?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, follow, panelRef]);

  return open ? pos : null;
}
