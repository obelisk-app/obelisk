import type { StateCreator } from 'zustand';
import type { ChatState } from './index';
import type { Category, Channel } from './types';

export interface ChannelsSlice {
  // Current server data
  pinnedChannels: Channel[];
  categories: Category[];
  activeChannelId: string | null;
  /** The last channel the user explicitly clicked / navigated to (as opposed
   *  to auto-landing on server change). Used by the mention-clear path so we
   *  don't silently mark a mention "read" just because the user booted the
   *  app and happened to auto-land on the channel that pinged them. */
  userSelectedChannelId: string | null;
  // When set, the chat pane is focused on a forum post's reply thread. The
  // parent forum channel remains the `activeChannelId`; `messages` holds the
  // post's replies instead of the channel's top-level stream.
  activePostId: string | null;
  isLoadingChannels: boolean;

  setChannels: (pinned: Channel[], categories: Category[]) => void;
  setActiveChannel: (channelId: string) => void;
  /** Like setActiveChannel, but also records the channel as user-selected so
   *  the mention-clear effect knows this was intentional navigation. */
  userSelectChannel: (channelId: string) => void;
  setActivePostId: (postId: string | null) => void;
  setLoadingChannels: (loading: boolean) => void;
}

export const CHANNELS_INITIAL_STATE = {
  pinnedChannels: [] as Channel[],
  categories: [] as Category[],
  activeChannelId: null as string | null,
  userSelectedChannelId: null as string | null,
  activePostId: null as string | null,
  isLoadingChannels: true,
};

export const createChannelsSlice: StateCreator<ChatState, [], [], ChannelsSlice> = (set) => ({
  ...CHANNELS_INITIAL_STATE,

  setChannels: (pinnedChannels, categories) => set({ pinnedChannels, categories, isLoadingChannels: false }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId, activePostId: null, messages: [], isLoadingMessages: true, replyingTo: null, messageCursor: null, hasMoreMessages: false, typingUsers: {}, isNearBottom: true }),
  userSelectChannel: (channelId) => set({ activeChannelId: channelId, userSelectedChannelId: channelId, activePostId: null, messages: [], isLoadingMessages: true, replyingTo: null, messageCursor: null, hasMoreMessages: false, typingUsers: {}, isNearBottom: true }),
  setActivePostId: (postId) => set({ activePostId: postId, messages: [], isLoadingMessages: true, replyingTo: null, editingMessage: null, messageCursor: null, hasMoreMessages: false, isNearBottom: true }),
  setLoadingChannels: (loading) => set({ isLoadingChannels: loading }),
});
