/**
 * The bell popover's two tabs, each with its unread count. Pure.
 */

export type NotifTab = 'mentions' | 'dms';

export interface InboxTab {
  readonly key: NotifTab;
  readonly count: number;
  readonly testId: string;
}

/** Mentions first, then DMs, in the order the segmented control shows them. */
export function inboxTabs(unreadMentions: number, unreadDms: number): InboxTab[] {
  return [
    { key: 'mentions', count: unreadMentions, testId: 'notif-tab-mentions' },
    { key: 'dms', count: unreadDms, testId: 'notif-tab-dms' },
  ];
}
