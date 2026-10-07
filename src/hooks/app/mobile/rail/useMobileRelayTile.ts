'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { faviconFor } from '@/services/relay-info';
import { useRelayBranding } from '@/hooks/relay/useRelayBranding';
import { useRelayInfo } from '@/hooks/app/rail/useRelayInfo';
import { useUnreadMentionCount } from '@/hooks/notifications/useNotificationSelectors';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { relayTileLabel, relayTileLetter, unreadBadgeText } from '@/utils/shell/mobile/rail';

/** What a long press (or a right-click) on a phone relay tile hands over. */
export interface RelayLongPressInfo {
  url: string;
  label: string;
  iconUrl: string | null;
}

/** How long a touch has to stay down to count as a long press. */
export const RELAY_TILE_LONG_PRESS_MS = 500;

/**
 * One tile in the phone's relay rail (`mobile/rail/RelayTile.tsx`): its
 * label, its icon, the background-unread badge, and the press handling that
 * tells a tap from a long press.
 */
export function useMobileRelayTile(
  url: string,
  active: boolean,
  onClick: () => void,
  onLongPress?: (info: RelayLongPressInfo) => void,
) {
  const [iconFailed, setIconFailed] = useState(false);
  // NIP-11 gives the name and the operator. The tile icon is the domain
  // favicon, not NIP-11 metadata and not kind 30078 branding.
  const { info } = useRelayInfo(url);
  const operator = info?.pubkey || null;
  // Operator-published kind 30078 branding only contributes the NAME: its
  // image is the desktop banner, not a circular space icon.
  const branding = useRelayBranding(url, operator ? [operator] : []);
  const label = relayTileLabel(branding.name, info?.name, url);
  const favicon = faviconFor(url);
  const iconUrl = favicon && !iconFailed ? favicon : null;
  // Only meaningful for relays you're NOT on: the active relay's pings are
  // in the bell. Fed by the background relay watch.
  const backgroundUnread = useUnreadMentionCount(active ? null : normalizeRelayUrl(url));

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = useRef(false);
  const fireLongPress = () => {
    pressFired.current = true;
    onLongPress?.({ url, label, iconUrl });
  };
  const startPress = () => {
    if (!onLongPress) return;
    pressFired.current = false;
    pressTimer.current = setTimeout(fireLongPress, RELAY_TILE_LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  // The click that ends a long press is not a tap.
  const click = () => {
    if (pressFired.current) {
      pressFired.current = false;
      return;
    }
    onClick();
  };
  const contextMenu = (e: MouseEvent) => {
    e.preventDefault();
    fireLongPress();
  };

  return {
    label,
    /** The icon to draw, or `null` for the letter on a gradient. */
    iconUrl,
    letter: relayTileLetter(label),
    onIconError: () => setIconFailed(true),
    backgroundUnread,
    badgeText: unreadBadgeText(backgroundUnread),
    onClick: click,
    startPress,
    cancelPress,
    /** Right-click opens the same menu; without a long-press handler the native menu stays. */
    onContextMenu: onLongPress ? contextMenu : undefined,
  };
}
