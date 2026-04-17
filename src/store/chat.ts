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
  /** "mesh" (P2P) or "sfu" (LiveKit). Only meaningful for voice channels. */
  voiceMode?: string | null;
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
export interface SlugCacheEntry {
  channelName: string | null;
  channelId: string | null;
  serverId: string | null;
  postTitle: string | null;
  messageAuthorName: string | null;
  noAccess: boolean;
  notFound: boolean;
  loading: boolean;
}

export function slugCacheKey(slug: string, opts?: { p?: string; m?: string }): string {
  return `${slug}|p=${opts?.p ?? ''}|m=${opts?.m ?? ''}`;
}

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
  // When set, the chat pane is focused on a forum post's reply thread. The
  // parent forum channel remains the `activeChannelId`; `messages` holds the
  // post's replies instead of the channel's top-level stream.
  activePostId: string | null;
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

  // Profile popover — when non-null, ProfilePopover is shown for this pubkey.
  profilePopupPubkey: string | null;
  openProfilePopup: (pubkey: string) => void;
  closeProfilePopup: () => void;

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

  // Cache of resolved share-link slugs. Keyed by `<slug>|p=<id>|m=<id>` so
  // each variant caches independently. `ChannelLinkPill` reads this to render
  // the resolved channel/post/message label instead of the raw slug.
  slugCache: Record<string, SlugCacheEntry>;

  // Followed forum post ids (localStorage-backed today; see FORUM_PLAN.md
  // Phase F for the future DB-backed subscription model). Rendered as
  // expandable subchannel rows under their forum channel in ChannelSidebar.
  followedPostIds: string[];
  // Resolved metadata for followed posts. Fetched via GET /api/forum/posts/meta.
  followedPostMeta: Record<string, { id: string; title: string; channelId: string; channelName: string; serverId: string }>;
  followedPostsLoading: boolean;
  // Session-only: post ids the user explicitly unfollowed this session.
  // Prevents auto-follow-on-send from immediately re-subscribing them.
  suppressedAutoFollowPostIds: string[];

  setMemberList: (members: MemberInfo[]) => void;
  // Apply a bot-updated socket payload: patches the matching bot row in
  // memberList with a new displayName / avatar / statusText. No-op if the
  // bot isn't in the current list (wrong active server, etc).
  applyBotUpdate: (update: {
    serverId: string;
    id: string;
    type: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    lastValue?: string | null;
  }) => void;
  setServerEmojis: (emojis: Record<string, string>) => void;
  setServerGifs: (gifs: ServerGif[]) => void;
  setServers: (servers: ServerInfo[]) => void;
  addServer: (server: ServerInfo) => void;
  removeServer: (serverId: string) => void;
  setActiveServer: (serverId: string) => void;
  setChannels: (pinned: Channel[], categories: Category[]) => void;
  setActiveChannel: (channelId: string) => void;
  setActivePostId: (postId: string | null) => void;
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

  // Share-link slug resolver — fires a fetch if the key isn't cached yet.
  resolveSlug: (slug: string, opts?: { p?: string; m?: string }) => Promise<void>;

  // Sync followedPostIds from localStorage + fetch metadata for any unknown ids.
  loadFollowedPosts: () => Promise<void>;
  // Toggle follow/unfollow for a given post. Updates localStorage + store.
  toggleFollowPost: (postId: string, meta?: { title: string; channelId: string; channelName: string; serverId: string }) => Promise<void>;

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
  activePostId: null,
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
  profilePopupPubkey: null,
  openProfilePopup: (pubkey) => set({ profilePopupPubkey: pubkey }),
  closeProfilePopup: () => set({ profilePopupPubkey: null }),
  onlinePubkeys: new Set<string>(),
  isNearBottom: true,
  myRole: null,
  serverEmojis: {},
  serverGifs: [],
  slugCache: {},
  followedPostIds: [],
  followedPostMeta: {},
  followedPostsLoading: false,
  suppressedAutoFollowPostIds: [],

  setMemberList: (members) => set({ memberList: members }),
  applyBotUpdate: (update) => set((state) => {
    const botPk = `bot:${update.id}`;
    const idx = state.memberList.findIndex((m) => m.pubkey === botPk);
    if (idx === -1) return state;
    const next = [...state.memberList];
    next[idx] = {
      ...next[idx],
      displayName: update.displayName ?? next[idx].displayName,
      picture: update.avatarUrl ?? next[idx].picture,
      statusText: update.lastValue ?? next[idx].statusText ?? null,
    };
    return { memberList: next };
  }),
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
  setActiveChannel: (channelId) => set({ activeChannelId: channelId, activePostId: null, messages: [], isLoadingMessages: true, replyingTo: null, messageCursor: null, hasMoreMessages: false, typingUsers: {}, isNearBottom: true }),
  setActivePostId: (postId) => set({ activePostId: postId, messages: [], isLoadingMessages: true, replyingTo: null, editingMessage: null, messageCursor: null, hasMoreMessages: false, isNearBottom: true }),
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

  resolveSlug: async (slug, opts) => {
    const key = slugCacheKey(slug, opts);
    const existing = useChatStore.getState().slugCache[key];
    if (existing) return; // cached (loading, resolved, or failed)
    set((state) => ({
      slugCache: {
        ...state.slugCache,
        [key]: {
          channelName: null,
          channelId: null,
          serverId: null,
          postTitle: null,
          messageAuthorName: null,
          noAccess: false,
          notFound: false,
          loading: true,
        },
      },
    }));
    try {
      const params = new URLSearchParams({ c: slug });
      if (opts?.p) params.set('p', opts.p);
      if (opts?.m) params.set('m', opts.m);
      const res = await fetch(`/api/channels/resolve-slug?${params.toString()}`);
      if (res.status === 404) {
        set((state) => ({
          slugCache: {
            ...state.slugCache,
            [key]: {
              channelName: null,
              channelId: null,
              serverId: null,
              postTitle: null,
              messageAuthorName: null,
              noAccess: false,
              notFound: true,
              loading: false,
            },
          },
        }));
        return;
      }
      if (!res.ok) throw new Error(`resolve-slug ${res.status}`);
      const data = await res.json();
      set((state) => ({
        slugCache: {
          ...state.slugCache,
          [key]: {
            channelName: data.channelName ?? null,
            channelId: data.channelId ?? null,
            serverId: data.serverId ?? null,
            postTitle: data.postTitle ?? null,
            messageAuthorName: data.messageAuthorName ?? null,
            noAccess: !!data.noAccess,
            notFound: false,
            loading: false,
          },
        },
      }));
    } catch {
      set((state) => ({
        slugCache: {
          ...state.slugCache,
          [key]: {
            channelName: null,
            channelId: null,
            serverId: null,
            postTitle: null,
            messageAuthorName: null,
            noAccess: false,
            notFound: true,
            loading: false,
          },
        },
      }));
    }
  },

  loadFollowedPosts: async () => {
    if (typeof window === 'undefined') return;
    set({ followedPostsLoading: true });

    // One-time migration: if the legacy localStorage key has entries and
    // hasn't been migrated yet, POST each id to the new follow API and then
    // clear the key. Best-effort — any failure leaves the key in place for
    // a retry next mount.
    try {
      const migrated = localStorage.getItem('obelisk:followed-migrated') === '1';
      if (!migrated) {
        const raw = localStorage.getItem('obelisk:followed-posts');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const legacyIds = parsed.filter((x): x is string => typeof x === 'string');
            for (const id of legacyIds) {
              try {
                await fetch(`/api/forum/posts/${encodeURIComponent(id)}/follow`, { method: 'POST' });
              } catch { /* ignore individual failures */ }
            }
          }
        }
        localStorage.setItem('obelisk:followed-migrated', '1');
        localStorage.removeItem('obelisk:followed-posts');
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch('/api/forum/posts/followed');
      if (res.ok) {
        const data = await res.json();
        const ids: string[] = [];
        const meta: Record<string, { id: string; title: string; channelId: string; channelName: string; serverId: string }> = {};
        const unreads: Record<string, number> = {};
        const mentions: Record<string, boolean> = {};
        for (const p of data.posts as Array<{ id: string; title: string; channelId: string; channelName: string; serverId: string; unreadCount?: number; hasMention?: boolean }>) {
          ids.push(p.id);
          meta[p.id] = p;
          if (typeof p.unreadCount === 'number' && p.unreadCount > 0) {
            unreads[p.id] = p.unreadCount;
          }
          if (p.hasMention) {
            mentions[p.id] = true;
          }
        }
        set({ followedPostIds: ids, followedPostMeta: meta });
        // Hydrate per-post unread counts + mention flags from the server.
        // Without the mention flag the red `@` only survives until the next
        // page refresh, since realtime-only flagging has no persistence.
        const { useNotificationStore } = await import('./notification');
        useNotificationStore.getState().setPostUnreads(unreads, mentions);
      }
    } catch { /* ignore */ }
    set({ followedPostsLoading: false });
  },

  toggleFollowPost: async (postId, meta) => {
    if (typeof window === 'undefined') return;
    const state = useChatStore.getState();
    const currentIds = Array.isArray(state.followedPostIds) ? state.followedPostIds : [];
    const currentMeta = state.followedPostMeta && typeof state.followedPostMeta === 'object' ? state.followedPostMeta : {};
    const currentSuppressed = Array.isArray(state.suppressedAutoFollowPostIds)
      ? state.suppressedAutoFollowPostIds
      : [];
    const wasFollowing = currentIds.includes(postId);

    // Optimistic update.
    const nextIds = wasFollowing
      ? currentIds.filter((x) => x !== postId)
      : [...currentIds, postId];
    const nextMeta = { ...currentMeta };
    if (wasFollowing) {
      delete nextMeta[postId];
    } else if (meta) {
      nextMeta[postId] = { id: postId, ...meta };
    }
    // When the user explicitly unfollows, remember so we don't re-follow
    // them automatically on their next send. When they explicitly follow,
    // clear the suppression.
    const nextSuppressed = wasFollowing
      ? Array.from(new Set([...currentSuppressed, postId]))
      : currentSuppressed.filter((x) => x !== postId);
    set({ followedPostIds: nextIds, followedPostMeta: nextMeta, suppressedAutoFollowPostIds: nextSuppressed });

    try {
      const res = await fetch(`/api/forum/posts/${encodeURIComponent(postId)}/follow`, { method: 'POST' });
      if (!res.ok) {
        console.warn('[follow] server rejected', res.status, await res.text().catch(() => ''));
        // Roll back optimistic update so the UI matches the server.
        set({
          followedPostIds: currentIds,
          followedPostMeta: currentMeta,
          suppressedAutoFollowPostIds: currentSuppressed,
        });
        return;
      }
    } catch (err) {
      console.warn('[follow] network error', err);
      return;
    }

    // After a follow, if we don't have metadata yet, refetch the full list.
    if (!wasFollowing && !meta) {
      await useChatStore.getState().loadFollowedPosts();
    }
  },

  setOnlinePubkeys: (pubkeys) => set({ onlinePubkeys: new Set(pubkeys) }),
  setPresence: (pubkey, online) => set((state) => {
    const next = new Set(state.onlinePubkeys);
    if (online) next.add(pubkey);
    else next.delete(pubkey);
    return { onlinePubkeys: next };
  }),
}));
