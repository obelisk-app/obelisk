/**
 * "Mark all read" on the phone inbox acts on the visible stream only:
 * clearing mentions must not silence unread DMs, and the reverse.
 */
import { useNotificationsStore } from '@/store/notifications';
import { useReadStateStore } from '@/store/read-state';

export type InboxStream = 'mentions' | 'dms';

export function markInboxStreamRead(
  stream: InboxStream,
  { relay, groupIds, peers }: { relay: string | null; groupIds: ReadonlyArray<string>; peers: ReadonlyArray<string> },
): void {
  if (stream === 'mentions') {
    if (relay) useNotificationsStore.getState().markMentionsRead(relay);
    useReadStateStore.getState().markAllAsRead([], groupIds);
  } else {
    useReadStateStore.getState().markAllAsRead(peers, []);
  }
}
