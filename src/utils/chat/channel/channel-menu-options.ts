
export interface ChannelMenuTarget {
  readonly relay: string;
  readonly channelId: string;
  readonly name: string;
  /** Unread messages or unseen mention cards: "Mark as read" is greyed without. */
  readonly hasUnread: boolean;
}

/** Room a submenu needs beside the menu before it opens to the left instead. */
const SUBMENU_ROOM = 240;
const EDGE = 8;

/**
 * Where a `width` x `height` menu opened at (x, y) sits so it stays 8px
 * inside the viewport, and whether its submenus must open to the left.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const left = Math.max(EDGE, Math.min(x, viewportWidth - width - EDGE));
  const top = Math.max(EDGE, Math.min(y, viewportHeight - height - EDGE));
  return { left, top, flipSub: left + width + SUBMENU_ROOM > viewportWidth };
}

/**
 * How far a submenu slides up so its bottom clears the viewport by 8px,
 * never so far that its top passes 8px from the top edge. 0 when it fits.
 */
export function subMenuShift(top: number, bottom: number, viewportHeight: number): number {
  const overflow = bottom - (viewportHeight - EDGE);
  return overflow > 0 ? -Math.min(overflow, Math.max(0, top - EDGE)) : 0;
}
