import { create } from 'zustand';

export type InboxEventType = 'mention' | 'reply' | 'everyone' | 'dm' | 'message';

export interface NotificationEvent {
  type: InboxEventType;
  channelId?: string;
  serverId?: string;
  messageId?: string;
  postId?: string;
  senderPubkey: string;
  preview?: string;
  createdAt: string;
}

export interface InboxEvent extends NotificationEvent {
  id: string;
  read: boolean;
}

export const INBOX_CAP = 50;

interface NotificationState {
  channelUnreads: Record<string, number>;
  channelMentions: Record<string, boolean>;
  /** Server-authoritative per-channel read cursor (unix ms). Used client-side
   *  to anchor the "New messages" separator exactly at the read boundary so
   *  the viewer's own messages don't appear below it. */
  channelLastReadAt: Record<string, number>;
  postUnreads: Record<string, number>;
  postMentions: Record<string, boolean>;
  dmUnreads: Record<string, number>;
  /**
   * Server-authoritative per-thread read cursor (unix ms). Used client-side
   * together with the local Nostr cache to compute real DM unread counts
   * (since DM content is never decrypted server-side).
   */
  dmLastReadAt: Record<string, number>;
  // channelId -> serverId mapping for server-level aggregation
  channelServerMap: Record<string, string>;

  /** Session-scoped inbox log (newest first, capped at INBOX_CAP). Cleared by
   *  `reset()` on logout so history never leaks across accounts. */
  inboxEvents: InboxEvent[];
  unreadInboxCount: number;

  setChannelUnread: (channelId: string, count: number, hasMention?: boolean) => void;
  incrementChannelUnread: (channelId: string, hasMention?: boolean) => void;
  clearChannelUnread: (channelId: string) => void;
  /** Flag-only mention toggle. Separate from the unread count so the mention
   *  dot can be cleared independently (e.g. when opening a channel without
   *  being scrolled to the bottom). */
  setChannelMention: (channelId: string, hasMention: boolean) => void;
  clearChannelMention: (channelId: string) => void;
  incrementPostUnread: (postId: string, hasMention?: boolean) => void;
  setPostMention: (postId: string, hasMention: boolean) => void;
  clearPostUnread: (postId: string) => void;
  setPostUnreads: (counts: Record<string, number>, mentions?: Record<string, boolean>) => void;
  setDMUnread: (pubkey: string, count: number) => void;
  setDMUnreads: (counts: Record<string, number>) => void;
  clearDMUnread: (pubkey: string) => void;
  setDMLastReadAt: (pubkey: string, tsMs: number) => void;
  setBulkUnreads: (data: {
    channels: Record<string, number>;
    dms: Record<string, number>;
    dmLastReadAt?: Record<string, number>;
    channelLastReadAt?: Record<string, number>;
    mentionChannels: Record<string, boolean>;
  }) => void;
  setChannelServerMap: (map: Record<string, string>) => void;
  pushInboxEvent: (evt: NotificationEvent) => void;
  markInboxRead: () => void;
  clearInboxEvents: () => void;
  /** Reset all counts/mentions/cursors. Used on logout/account-switch. */
  reset: () => void;
}

export const NOTIFICATION_INITIAL_STATE = {
  channelUnreads: {} as Record<string, number>,
  channelMentions: {} as Record<string, boolean>,
  channelLastReadAt: {} as Record<string, number>,
  postUnreads: {} as Record<string, number>,
  postMentions: {} as Record<string, boolean>,
  dmUnreads: {} as Record<string, number>,
  dmLastReadAt: {} as Record<string, number>,
  channelServerMap: {} as Record<string, string>,
  inboxEvents: [] as InboxEvent[],
  unreadInboxCount: 0,
};

export const useNotificationStore = create<NotificationState>()((set) => ({
  ...NOTIFICATION_INITIAL_STATE,

  setChannelUnread: (channelId, count, hasMention) => set((state) => ({
    channelUnreads: { ...state.channelUnreads, [channelId]: count },
    channelMentions: hasMention !== undefined
      ? { ...state.channelMentions, [channelId]: hasMention }
      : state.channelMentions,
  })),

  incrementChannelUnread: (channelId, hasMention) => set((state) => ({
    channelUnreads: {
      ...state.channelUnreads,
      [channelId]: (state.channelUnreads[channelId] || 0) + 1,
    },
    channelMentions: hasMention
      ? { ...state.channelMentions, [channelId]: true }
      : state.channelMentions,
  })),

  clearChannelUnread: (channelId) => set((state) => {
    const { [channelId]: _, ...restUnreads } = state.channelUnreads;
    const { [channelId]: __, ...restMentions } = state.channelMentions;
    return { channelUnreads: restUnreads, channelMentions: restMentions };
  }),

  setChannelMention: (channelId, hasMention) => set((state) => {
    if (hasMention) {
      return { channelMentions: { ...state.channelMentions, [channelId]: true } };
    }
    const { [channelId]: _, ...rest } = state.channelMentions;
    return { channelMentions: rest };
  }),

  clearChannelMention: (channelId) => set((state) => {
    const { [channelId]: _, ...rest } = state.channelMentions;
    return { channelMentions: rest };
  }),

  incrementPostUnread: (postId, hasMention) => set((state) => ({
    postUnreads: {
      ...state.postUnreads,
      [postId]: (state.postUnreads[postId] || 0) + 1,
    },
    postMentions: hasMention
      ? { ...state.postMentions, [postId]: true }
      : state.postMentions,
  })),

  setPostMention: (postId, hasMention) => set((state) => ({
    postMentions: hasMention
      ? { ...state.postMentions, [postId]: true }
      : (() => {
          const { [postId]: _, ...rest } = state.postMentions;
          return rest;
        })(),
  })),

  clearPostUnread: (postId) => set((state) => {
    const { [postId]: _, ...restUnreads } = state.postUnreads;
    const { [postId]: __, ...restMentions } = state.postMentions;
    return { postUnreads: restUnreads, postMentions: restMentions };
  }),

  setPostUnreads: (counts, mentions) => set((state) => ({
    postUnreads: counts,
    postMentions: mentions ?? state.postMentions,
  })),

  setDMUnread: (pubkey, count) => set((state) => ({
    dmUnreads: { ...state.dmUnreads, [pubkey]: count },
  })),

  setDMUnreads: (counts) => set({ dmUnreads: counts }),

  clearDMUnread: (pubkey) => set((state) => {
    const { [pubkey]: _, ...rest } = state.dmUnreads;
    return { dmUnreads: rest };
  }),

  setDMLastReadAt: (pubkey, tsMs) => set((state) => ({
    dmLastReadAt: { ...state.dmLastReadAt, [pubkey]: tsMs },
  })),

  setBulkUnreads: (data) => set((state) => ({
    channelUnreads: data.channels,
    dmUnreads: data.dms,
    dmLastReadAt: data.dmLastReadAt ?? state.dmLastReadAt,
    channelLastReadAt: data.channelLastReadAt ?? state.channelLastReadAt,
    channelMentions: data.mentionChannels,
  })),

  setChannelServerMap: (map) => set({ channelServerMap: map }),

  pushInboxEvent: (evt) => set((state) => {
    const id = `${evt.createdAt}-${evt.senderPubkey}-${evt.messageId ?? evt.channelId ?? evt.postId ?? Math.random().toString(36).slice(2, 8)}`;
    // Dedupe: if an event with this id already exists, skip (socket replay).
    if (state.inboxEvents.some((e) => e.id === id)) return {};
    const next: InboxEvent = { ...evt, id, read: false };
    const inboxEvents = [next, ...state.inboxEvents].slice(0, INBOX_CAP);
    return { inboxEvents, unreadInboxCount: state.unreadInboxCount + 1 };
  }),

  markInboxRead: () => set((state) => ({
    inboxEvents: state.inboxEvents.map((e) => (e.read ? e : { ...e, read: true })),
    unreadInboxCount: 0,
  })),

  clearInboxEvents: () => set({ inboxEvents: [], unreadInboxCount: 0 }),

  reset: () => set({ ...NOTIFICATION_INITIAL_STATE, inboxEvents: [], unreadInboxCount: 0 }),
}));

// Derived helpers (use outside React or in callbacks)
export function getServerUnreadCount(serverChannelIds: string[]): number {
  const { channelUnreads } = useNotificationStore.getState();
  return serverChannelIds.reduce((sum, id) => sum + (channelUnreads[id] || 0), 0);
}

export function getServerHasMention(serverChannelIds: string[]): boolean {
  const { channelMentions } = useNotificationStore.getState();
  return serverChannelIds.some(id => channelMentions[id]);
}

export function getTotalDMUnreads(): number {
  const { dmUnreads } = useNotificationStore.getState();
  return Object.values(dmUnreads).reduce((sum, n) => sum + n, 0);
}
