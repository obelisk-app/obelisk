import { create } from 'zustand';

export interface Channel {
  id: string;
  name: string;
  emoji: string | null;
  type: string;
  position: number;
  categoryId: string | null;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  channels: Channel[];
}

export interface Message {
  id: string;
  channelId: string;
  authorPubkey: string;
  content: string;
  replyToId: string | null;
  createdAt: string;
  replyTo?: { id: string; content: string; authorPubkey: string } | null;
}

export interface ServerInfo {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
}

interface ChatState {
  // Multi-server support
  servers: ServerInfo[];
  activeServerId: string | null;

  // Current server data
  pinnedChannels: Channel[];
  categories: Category[];
  activeChannelId: string | null;
  messages: Message[];
  isLoadingChannels: boolean;
  isLoadingMessages: boolean;

  // Reply state
  replyingTo: Message | null;

  setServers: (servers: ServerInfo[]) => void;
  setActiveServer: (serverId: string) => void;
  setChannels: (pinned: Channel[], categories: Category[]) => void;
  setActiveChannel: (channelId: string) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;
  setLoadingChannels: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setReplyingTo: (message: Message | null) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  servers: [],
  activeServerId: null,
  pinnedChannels: [],
  categories: [],
  activeChannelId: null,
  messages: [],
  isLoadingChannels: true,
  isLoadingMessages: false,
  replyingTo: null,

  setServers: (servers) => set({ servers }),
  setActiveServer: (serverId) => set({
    activeServerId: serverId,
    pinnedChannels: [],
    categories: [],
    activeChannelId: null,
    messages: [],
    isLoadingChannels: true,
  }),
  setChannels: (pinnedChannels, categories) => set({ pinnedChannels, categories, isLoadingChannels: false }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId, messages: [], isLoadingMessages: true, replyingTo: null }),
  setMessages: (messages) => set({ messages, isLoadingMessages: false }),
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  removeMessage: (messageId) => set((state) => ({
    messages: state.messages.filter((m) => m.id !== messageId),
  })),
  setLoadingChannels: (loading) => set({ isLoadingChannels: loading }),
  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
  setReplyingTo: (message) => set({ replyingTo: message }),
}));
