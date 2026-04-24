import type { StateCreator } from 'zustand';
import type { ChatState } from './index';
import type { MyServerRole, ServerGif, ServerInfo } from './types';

export interface ServersSlice {
  // Multi-server support
  servers: ServerInfo[];
  activeServerId: string | null;

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

  setServers: (servers: ServerInfo[]) => void;
  addServer: (server: ServerInfo) => void;
  removeServer: (serverId: string) => void;
  setActiveServer: (serverId: string) => void;
  setMyRole: (role: MyServerRole) => void;
  setServerEmojis: (emojis: Record<string, string>) => void;
  setServerGifs: (gifs: ServerGif[]) => void;
}

export const SERVERS_INITIAL_STATE = {
  servers: [] as ServerInfo[],
  activeServerId: null as string | null,
  myRole: null as MyServerRole,
  serverEmojis: {} as Record<string, string>,
  serverGifs: [] as ServerGif[],
};

export const createServersSlice: StateCreator<ChatState, [], [], ServersSlice> = (set) => ({
  ...SERVERS_INITIAL_STATE,

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
    userSelectedChannelId: null,
    messages: [],
    isLoadingChannels: true,
    serverEmojis: {},
    serverGifs: [],
  }),
  setMyRole: (role) => set({ myRole: role }),
  setServerEmojis: (emojis) => set({ serverEmojis: emojis }),
  setServerGifs: (gifs) => set({ serverGifs: gifs }),
});
