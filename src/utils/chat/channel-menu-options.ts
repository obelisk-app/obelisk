import { MUTED_FOREVER, type ChannelNotifyLevel } from '@/store/channel-prefs';
import type { MessageKey } from '@/i18n/keys';

export interface ChannelMenuTarget {
  readonly relay: string;
  readonly channelId: string;
  readonly name: string;
  /** Unread messages or unseen mention cards: "Mark as read" is greyed without. */
  readonly hasUnread: boolean;
}

export const MUTE_OPTIONS: ReadonlyArray<{ key: MessageKey; ms: number }> = [
  { key: 'chat.channelMenu.mute.15m', ms: 15 * 60_000 },
  { key: 'chat.channelMenu.mute.1h', ms: 60 * 60_000 },
  { key: 'chat.channelMenu.mute.8h', ms: 8 * 60 * 60_000 },
  { key: 'chat.channelMenu.mute.24h', ms: 24 * 60 * 60_000 },
  { key: 'chat.channelMenu.mute.forever', ms: MUTED_FOREVER },
];

export const NOTIFY_OPTIONS: ReadonlyArray<{ level: ChannelNotifyLevel; key: MessageKey }> = [
  { level: 'all', key: 'chat.channelMenu.notify.all' },
  { level: 'mentions', key: 'chat.channelMenu.notify.mentions' },
  { level: 'nothing', key: 'chat.channelMenu.notify.nothing' },
];

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
