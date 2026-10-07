import { useState } from 'react';
import { useBridge, useCurrentRelayUrl, useGroups, type JsGroup } from '@/services/nostr-bridge';
import type { MentionNotification } from '@/store/notifications';
import {
  useDmNotifications,
  useLockedDmCount,
  useMentionNotifications,
  useUnreadDmNotificationCount,
  useUnreadMentionCount,
} from '@/hooks/notifications/useNotificationSelectors';
import { markInboxStreamRead, type InboxStream } from '@/services/shell/mobile/inbox-read';

/**
 * The phone inbox: the mentions on the active relay and the DM pings, one
 * tab each with its unread count, the locked-DM row, and "mark all read"
 * for the visible stream. Bridge stores are read at click time so the
 * screen does not re-render on every message arrival.
 */
export function useInboxScreen(selectGroup: (groupId: string, kind: JsGroup['kind']) => void) {
  const relay = useCurrentRelayUrl();
  const mentions = useMentionNotifications(relay);
  const dmNotifications = useDmNotifications();
  const lockedDms = useLockedDmCount();
  const groups = useGroups();
  const bridge = useBridge();
  const [tab, setTab] = useState<InboxStream>('mentions');
  return {
    tab,
    setTab,
    mentions,
    dmNotifications,
    lockedDms,
    unreadMentions: useUnreadMentionCount(relay),
    unreadDms: useUnreadDmNotificationCount(),
    isEmpty: tab === 'mentions' ? mentions.length === 0 : dmNotifications.length === 0 && lockedDms === 0,
    markAllRead: () => markInboxStreamRead(tab, {
      relay,
      groupIds: bridge ? Object.keys(bridge.messagesByGroup.get()) : [],
      peers: bridge ? Object.keys(bridge.dmsByPeer.get()) : [],
    }),
    /** Open the mention's channel as the kind it is; a channel not loaded opens as text. */
    jumpToMention: (m: MentionNotification) => {
      const g = groups.find((x) => x.id === m.channelId);
      selectGroup(m.channelId, g?.kind ?? 'text');
    },
  };
}
