'use client';

import { useEffect, useState } from 'react';
import { getBridgeImpl } from '@/services/nostr-bridge';
import { faviconFor, fetchRelayInfo } from '@/services/relay-info';
import { useReadStateStore } from '@/store/read-state';
import { useNotificationsStore } from '@/store/notifications';
import {
  useDmNotifications,
  useMentionCursor,
  useMentionNotifications,
  useNotificationBadgeCount,
  useUnreadDmNotificationCount,
  useUnreadMentionCount,
} from '@/services/notifications/selectors';

/**
 * Close a popover on a click outside it (or its trigger) and on Escape.
 * `popoverAttr` / `triggerAttr` are the data attributes that mark the two.
 */
export function useDismissOnOutside(
  open: boolean,
  /** Stable (a state setter); called with `false`. */
  setOpen: (open: boolean) => void,
  popoverAttr: string,
  triggerAttr: string,
) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(`[${popoverAttr}]`) || t.closest(`[${triggerAttr}]`)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, setOpen, popoverAttr, triggerAttr]);
}

/** The relay's NIP-11 name and icon for the top bar; the old one stays until the new answer lands. */
export function useRelayHeaderInfo(relay: string) {
  const [info, setInfo] = useState<{ name?: string; icon?: string } | null>(null);
  // Stamped with the relay whose icon failed, so switching relays retries
  // the new icon with no reset step.
  const [iconFailedFor, setIconFailedFor] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRelayInfo(relay).then((r) => {
      if (!alive) return;
      setInfo({ name: r?.name, icon: r?.icon || faviconFor(relay) || undefined });
    });
    return () => {
      alive = false;
    };
  }, [relay]);
  return {
    name: info?.name,
    icon: iconFailedFor === relay ? undefined : info?.icon,
    onIconError: () => setIconFailedFor(relay),
  };
}

export type NotifTab = 'mentions' | 'dms';

/**
 * The bell's two independent streams, see `src/store/notifications.ts`.
 * Mentions are scoped to the relay this top bar represents; DMs are
 * account-wide.
 */
export function useInboxStreams(relay: string) {
  const [notifTab, setNotifTab] = useState<NotifTab>('mentions');
  const mentions = useMentionNotifications(relay);
  const mentionCursor = useMentionCursor(relay);
  const dmNotifications = useDmNotifications();
  const dmCursor = useReadStateStore((s) => s.inboxLastReadAt);
  const unreadMentions = useUnreadMentionCount(relay);
  const unreadDms = useUnreadDmNotificationCount();
  const unreadInboxCount = useNotificationBadgeCount(relay);
  const markMentionsRead = useNotificationsStore((s) => s.markMentionsRead);
  const clearMentions = useNotificationsStore((s) => s.clearMentions);
  const clearDmNotifications = useNotificationsStore((s) => s.clearDmNotifications);
  const markAllAsRead = useReadStateStore((s) => s.markAllAsRead);

  // Marking read is per-stream: dismissing mentions must not silence DMs.
  // The mentions side also advances the channel cursors for this relay so
  // the sidebar unread dots agree with the bell; the DM side advances the
  // per-peer cursors for the same reason. Bridge stores are read
  // imperatively at click time to keep this top bar from re-rendering on
  // every message arrival.
  const handleMarkRead = () => {
    const impl = getBridgeImpl();
    if (notifTab === 'mentions') {
      markMentionsRead(relay);
      markAllAsRead([], impl ? Object.keys(impl.messagesByGroup.get()) : []);
    } else {
      markAllAsRead(impl ? Object.keys(impl.dmsByPeer.get()) : [], []);
    }
  };
  const handleClear = () => {
    if (notifTab === 'mentions') clearMentions(relay);
    else clearDmNotifications();
  };

  return {
    notifTab, setNotifTab,
    mentions, mentionCursor, dmNotifications, dmCursor,
    unreadMentions, unreadDms, unreadInboxCount,
    tabItems: notifTab === 'mentions' ? mentions : dmNotifications,
    tabUnread: notifTab === 'mentions' ? unreadMentions : unreadDms,
    handleMarkRead,
    handleClear,
  };
}

export type InboxStreams = ReturnType<typeof useInboxStreams>;
