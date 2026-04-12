import { create } from 'zustand';
import type { MemberInfo } from '@/lib/mentions';

export type { MemberInfo };

export interface ForumTag {
  id: string;
  name: string;
  color: string;
}

export interface Channel {
  id: string;
  name: string;
  emoji: string | null;
  description?: string | null;
  type: string;
  position: number;
  categoryId: string | null;
  forumTags?: ForumTag[];
  /** null/"everyone" = anyone, "mod" = mods+, "admin" = admins+. */
  writePermission?: string | null;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  channels: Channel[];
}

export interface Reaction {
  id: string;
  messageId: string;
  authorPubkey: string;
  emoji: string;
}

export interface EmbeddedAuthor {
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  nickname: string | null;
}

export interface Message {
  id: string;
  channelId: string;
  authorPubkey: string;
  content: string;
  replyToId: string | null;
  createdAt: string;
  editedAt: string | null;
  pinnedAt?: string | null;
  pinnedByPubkey?: string | null;
  replyTo?: { id: string; content: string; authorPubkey: string } | null;
  reactions?: Reaction[];
  // Embedded author profile attached by the server on Socket.io emits,
  // so clients never need to wait for a separate profile fetch.
  author?: EmbeddedAuthor | null;
}

export type MyServerRole = 'owner' | 'admin' | 'mod' | 'member' | null;

export interface ServerInfo {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  ownerPubkey?: string;
}

// One row of the server's GIF library. Mirrors the shape returned by GET
// /api/gifs (member-facing) — a minimal view that omits admin-only fields
// like `uploadedBy` and `sizeBytes`.
export interface ServerGif {
  id: string;
  name: string;
  url: string;
  tags: string; // comma-separated, lowercased
  width: number | null;
  height: number | null;
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

  // Reply & edit state
  replyingTo: Message | null;
  editingMessage: Message | null;

  // Message pagination
  messageCursor: string | null;
  hasMoreMessages: boolean;

  // Members (for mentions autocomplete)
  memberList: MemberInfo[];

  // Presence: pubkeys currently connected via Socket.io
  onlinePubkeys: Set<string>;

  // Typing indicator
  typingUsers: Record<string, number>; // pubkey -> timeout id

  // Search: jump to message highlight
  highlightedMessageId: string | null;

  // Scroll gate used by useReadTracker to decide whether the user is
  // "actually looking at" the latest messages. True when the message list
  // is within ~100px of the bottom. Reset to true on channel change so a
  // freshly-opened channel with no scroll activity still qualifies.
  isNearBottom: boolean;

  // Role of the authed user on the active server. Populated by the chat
  // page after load. Used to gate admin-only UI affordances (e.g. pinning).
  myRole: MyServerRole;

  // Custom server emojis (name → image URL). Refreshed on server select via
  // `GET /api/admin/emojis?serverId=…`. Used by `MessageContent` and
  // `EmojiPicker` to render `:partyparrot:` inline. Empty object = no customs.
  serverEmojis: Record<string, string>;

  // Curated per-server GIF library. Refreshed on server select via
  // `GET /api/gifs?serverId=…`. Used by the composer's GIF picker. Empty
  // array = no GIFs uploaded yet. Ordered newest-first to match the API.
  serverGifs: ServerGif[];

  setMemberList: (members: MemberInfo[]) => void;
  setServerEmojis: (emojis: Record<string, string>) => void;
  setServerGifs: (gifs: ServerGif[]) => void;
  setServers: (servers: ServerInfo[]) => void;
  addServer: (server: ServerInfo) => void;
  removeServer: (serverId: string) => void;
  setActiveServer: (serverId: string) => void;
  setChannels: (pinned: Channel[], categories: Category[]) => void;
  setActiveChannel: (channelId: string) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;
  updateMessage: (messageId: string, content: string, editedAt: string) => void;
  updateReactions: (messageId: string, reactions: Reaction[]) => void;
  setLoadingChannels: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setReplyingTo: (message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;

  // Pagination
  setMessageCursor: (cursor: string | null, hasMore: boolean) => void;
  prependMessages: (messages: Message[]) => void;

  // Typing
  setTyping: (pubkey: string) => void;
  clearTyping: (pubkey: string) => void;

  // Presence
  setOnlinePubkeys: (pubkeys: string[]) => void;
  setPresence: (pubkey: string, online: boolean) => void;

  // Scroll gate
  setIsNearBottom: (near: boolean) => void;

  // Role on active server
  setMyRole: (role: MyServerRole) => void;

  // Pin state updates (applied to existing messages in the active channel)
  updatePinState: (
    messageId: string,
    pinnedAt: string | null,
    pinnedByPubkey: string | null,
  ) => void;
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
  editingMessage: null,
  messageCursor: null,
  hasMoreMessages: false,
  typingUsers: {},
  highlightedMessageId: null,
  memberList: [],
  onlinePubkeys: new Set<string>(),
  isNearBottom: true,
  myRole: null,
  serverEmojis: {},
  serverGifs: [],

  setMemberList: (members) => set({ memberList: members }),
  setServerEmojis: (emojis) => set({ serverEmojis: emojis }),
  setServerGifs: (gifs) => set({ serverGifs: gifs }),
  setServers: (servers) => set({ servers }),
  addServer: (server) => set((state) => ({
    servers: [...state.servers, server],
  })),
  removeServer: (serverId) => set((state) => ({
    servers: state.servers.filter((s) => s.id !== serverId),
  })),
  setActiveServer: (serverId) => set({
    activeServerId: serverId,
    pinnedChannels: [],
    categories: [],
    activeChannelId: null,
    messages: [],
    isLoadingChannels: true,
    serverEmojis: {},
    serverGifs: [],
  }),
  setChannels: (pinnedChannels, categories) => set({ pinnedChannels, categories, isLoadingChannels: false }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId, messages: [], isLoadingMessages: true, replyingTo: null, messageCursor: null, hasMoreMessages: false, typingUsers: {}, isNearBottom: true }),
  setMessages: (messages) => set({ messages, isLoadingMessages: false }),
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  removeMessage: (messageId) => set((state) => ({
    messages: state.messages.filter((m) => m.id !== messageId),
  })),
  updateMessage: (messageId, content, editedAt) => set((state) => ({
    messages: state.messages.map((m) =>
      m.id === messageId ? { ...m, content, editedAt } : m
    ),
  })),
  updateReactions: (messageId, reactions) => set((state) => ({
    messages: state.messages.map((m) =>
      m.id === messageId ? { ...m, reactions } : m
    ),
  })),
  setLoadingChannels: (loading) => set({ isLoadingChannels: loading }),
  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
  setReplyingTo: (message) => set({ replyingTo: message }),
  setEditingMessage: (message) => set({ editingMessage: message }),

  setMessageCursor: (cursor, hasMore) => set({ messageCursor: cursor, hasMoreMessages: hasMore }),
  prependMessages: (messages) => set((state) => ({
    messages: [...messages, ...state.messages],
  })),

  setTyping: (pubkey) => set((state) => {
    // Clear existing timeout for this user if any
    if (state.typingUsers[pubkey]) {
      clearTimeout(state.typingUsers[pubkey]);
    }
    const timeoutId = window.setTimeout(() => {
      useChatStore.getState().clearTyping(pubkey);
    }, 3000);
    return { typingUsers: { ...state.typingUsers, [pubkey]: timeoutId } };
  }),
  clearTyping: (pubkey) => set((state) => {
    const { [pubkey]: _, ...rest } = state.typingUsers;
    return { typingUsers: rest };
  }),

  setIsNearBottom: (near) => set((state) => (state.isNearBottom === near ? state : { isNearBottom: near })),

  setMyRole: (role) => set({ myRole: role }),

  updatePinState: (messageId, pinnedAt, pinnedByPubkey) => set((state) => ({
    messages: state.messages.map((m) =>
      m.id === messageId ? { ...m, pinnedAt, pinnedByPubkey } : m
    ),
  })),

  setOnlinePubkeys: (pubkeys) => set({ onlinePubkeys: new Set(pubkeys) }),
  setPresence: (pubkey, online) => set((state) => {
    const next = new Set(state.onlinePubkeys);
    if (online) next.add(pubkey);
    else next.delete(pubkey);
    return { onlinePubkeys: next };
  }),
}));
