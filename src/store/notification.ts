import { create } from 'zustand';

export interface NotificationEvent {
  type: 'mention' | 'dm';
  channelId?: string;
  serverId?: string;
  messageId?: string;
  senderPubkey: string;
  preview?: string;
  createdAt: string;
}

interface NotificationState {
  channelUnreads: Record<string, number>;
  channelMentions: Record<string, boolean>;
  dmUnreads: Record<string, number>;
  /**
   * Server-authoritative per-thread read cursor (unix ms). Used client-side
   * together with the local Nostr cache to compute real DM unread counts
   * (since DM content is never decrypted server-side).
   */
  dmLastReadAt: Record<string, number>;
  // channelId -> serverId mapping for server-level aggregation
  channelServerMap: Record<string, string>;
  permissionGranted: boolean;

  setChannelUnread: (channelId: string, count: number, hasMention?: boolean) => void;
  incrementChannelUnread: (channelId: string, hasMention?: boolean) => void;
  clearChannelUnread: (channelId: string) => void;
  setDMUnread: (pubkey: string, count: number) => void;
  setDMUnreads: (counts: Record<string, number>) => void;
  clearDMUnread: (pubkey: string) => void;
  setDMLastReadAt: (pubkey: string, tsMs: number) => void;
  setBulkUnreads: (data: {
    channels: Record<string, number>;
    dms: Record<string, number>;
    dmLastReadAt?: Record<string, number>;
    mentionChannels: Record<string, boolean>;
  }) => void;
  setChannelServerMap: (map: Record<string, string>) => void;
  setPermission: (granted: boolean) => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  channelUnreads: {},
  channelMentions: {},
  dmUnreads: {},
  dmLastReadAt: {},
  channelServerMap: {},
  permissionGranted: false,

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
    channelMentions: data.mentionChannels,
  })),

  setChannelServerMap: (map) => set({ channelServerMap: map }),

  setPermission: (granted) => set({ permissionGranted: granted }),
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
