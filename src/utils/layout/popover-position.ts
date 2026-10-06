/** Which side of the anchor a popover opens on. */
export type PopoverSide = 'above' | 'below';
/** Which edge of the anchor the popover lines up with. */
export type PopoverAlign = 'start' | 'end';

export interface PopoverPlacement {
  top: number;
  left: number;
  side: PopoverSide;
}

export interface AnchorBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Keeps the panel off the viewport edges. */
export const POPOVER_MARGIN = 8;
/** Space between the anchor and the panel. */
export const POPOVER_GAP = 4;

/**
 * Where a `width` x `height` panel goes next to `anchor` inside a viewport:
 * the preferred side if it fits, else the other side, else whichever side
 * has more room; then clamped so it never leaves the viewport.
 */
export function placePopover({
  anchor,
  width,
  height,
  viewport,
  prefer,
  align,
}: {
  anchor: AnchorBox;
  width: number;
  height: number;
  viewport: { width: number; height: number };
  prefer: PopoverSide;
  align: PopoverAlign;
}): PopoverPlacement {
  const vh = viewport.height;
  const vw = viewport.width;
  const fitsBelow = anchor.bottom + POPOVER_GAP + height <= vh - POPOVER_MARGIN;
  const fitsAbove = anchor.top - POPOVER_GAP - height >= POPOVER_MARGIN;
  const fits = (side: PopoverSide) => (side === 'below' ? fitsBelow : fitsAbove);
  const other: PopoverSide = prefer === 'below' ? 'above' : 'below';
  const side: PopoverSide = fits(prefer)
    ? prefer
    : fits(other) ? other : (anchor.top > vh - anchor.bottom ? 'above' : 'below');
  let top = side === 'below' ? anchor.bottom + POPOVER_GAP : anchor.top - POPOVER_GAP - height;
  top = Math.max(POPOVER_MARGIN, Math.min(top, vh - POPOVER_MARGIN - height));
  const rawLeft = align === 'end' ? anchor.right - width : anchor.left;
  const left = Math.max(POPOVER_MARGIN, Math.min(rawLeft, vw - POPOVER_MARGIN - width));
  return { top, left, side };
}
