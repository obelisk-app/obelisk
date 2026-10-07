import { useRef, useState, type MouseEvent } from 'react';
import { useCurrentRelayUrl, useMyPubkey, type JsGroup } from '@/services/nostr-bridge';
import { isChannelMuted, useChannelPref } from '@/store/chat/channel-prefs';
import { useUnreadMentionCardsForChannel } from '@/hooks/notifications/useNotificationSelectors';
import { useCachedChannelHighlights } from '@/hooks/read-state/useChannelHighlights';
import { isVoiceKind, rowAttention } from '@/utils/shell/mobile/channel-row';

/** A touch held this long opens the channel menu. */
const LONG_PRESS_MS = 500;

/**
 * Long-press (or right-click) a channel row for the channel menu: mark read,
 * follow, mute, notification level, copy link. The tap that ends a long
 * press does not also open the channel. Voice channels, and rows with no
 * relay yet, have no menu.
 */
export function useChannelRow(group: JsGroup) {
  const relay = useCurrentRelayUrl();
  const myPubkey = useMyPubkey();
  const highlights = useCachedChannelHighlights(group.id, myPubkey);
  const mentionCards = useUnreadMentionCardsForChannel(relay, group.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = useRef(false);
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  return {
    hasMenu: !isVoiceKind(group.kind) && !!relay,
    target: {
      relay,
      channelId: group.id,
      name: group.name ?? group.id.slice(0, 8),
      hasUnread: highlights.unread > 0 || mentionCards > 0,
    },
    menuOpen,
    closeMenu: () => setMenuOpen(false),
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      setMenuOpen(true);
    },
    onTouchStart: () => {
      pressFired.current = false;
      cancelPress();
      pressTimer.current = setTimeout(() => {
        pressFired.current = true;
        setMenuOpen(true);
      }, LONG_PRESS_MS);
    },
    cancelPress,
    /** The long press already opened the menu; don't also navigate. */
    onClickCapture: (e: MouseEvent) => {
      if (!pressFired.current) return;
      e.stopPropagation();
      e.preventDefault();
      pressFired.current = false;
    },
  };
}

/** One channel row's look: its name, whether it is muted or quiet, and its counts. */
export function useChannelRowBody(group: JsGroup) {
  const myPubkey = useMyPubkey();
  const relay = useCurrentRelayUrl();
  const highlights = useCachedChannelHighlights(group.id, myPubkey);
  const pref = useChannelPref(relay, group.id);
  const mentionCards = useUnreadMentionCardsForChannel(relay, group.id);
  const muted = isChannelMuted(pref);
  return {
    name: group.name ?? group.id.slice(0, 8),
    muted,
    // Unfollowed or muted: its traffic stops asking for attention.
    quietStyle: pref.unfollowed || muted ? { opacity: 0.55 } : undefined,
    ...rowAttention(highlights, mentionCards, pref.unfollowed),
  };
}
