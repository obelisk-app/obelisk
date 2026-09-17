import { create } from 'zustand';
import type { RelayRole } from '@/lib/relay-roles';

export interface ChatState {
  activeChannelId: string | null;
  isNearBottom: boolean;
  serverEmojis: Record<string, string>;
  serverMediaKinds: Record<string, 'emoji' | 'gif' | 'sticker'>;
  /**
   * Relay roles held per pubkey, most senior first — fed by the shell from
   * `useRelayRoles` so message rows and the member list can render a badge
   * without each subscribing to the relay themselves.
   */
  rolesByPubkey: Record<string, readonly RelayRole[]>;
  profilePopupPubkey: string | null;
  profilePopupAnchor: { x: number; y: number } | null;
  /**
   * A pending "jump to this message" request, raised by search results.
   *
   * The shell owns both the active channel and the scroll/flash machinery,
   * but the search bar is mounted several levels below it in the channel
   * header, so this is the handoff. The shell switches channel, hands the
   * id to the message pane's existing `pendingMessageId` path (which waits
   * for the message to load before scrolling), and clears it.
   */
  pendingJump: { groupId: string; messageId: string } | null;
  lastActivityAt: Record<string, number>;
  presenceTick: number;
  setServerEmojis: (emojis: Record<string, string>, kinds?: ChatState['serverMediaKinds']) => void;
  setRolesByPubkey: (roles: ChatState['rolesByPubkey']) => void;
  openProfilePopup: (pubkey: string, anchor?: { x: number; y: number }) => void;
  closeProfilePopup: () => void;
  requestJump: (groupId: string, messageId: string) => void;
  consumeJump: () => void;
  recordActivity: (pubkey: string, atMs: number) => void;
  bumpPresenceTick: () => void;
  reset: () => void;
}

export const CHAT_INITIAL_STATE = {
  activeChannelId: null as string | null,
  isNearBottom: true,
  serverEmojis: {} as Record<string, string>,
  serverMediaKinds: {} as ChatState['serverMediaKinds'],
  rolesByPubkey: {} as ChatState['rolesByPubkey'],
  profilePopupPubkey: null as string | null,
  profilePopupAnchor: null as { x: number; y: number } | null,
  pendingJump: null as { groupId: string; messageId: string } | null,
  lastActivityAt: {} as Record<string, number>,
  presenceTick: 0,
};

export const useChatStore = create<ChatState>()((set) => ({
  ...CHAT_INITIAL_STATE,
  setServerEmojis: (serverEmojis, serverMediaKinds = {}) => set({ serverEmojis, serverMediaKinds }),
  setRolesByPubkey: (rolesByPubkey) => set({ rolesByPubkey }),
  openProfilePopup: (profilePopupPubkey, profilePopupAnchor = null) => set({ profilePopupPubkey, profilePopupAnchor }),
  closeProfilePopup: () => set({ profilePopupPubkey: null, profilePopupAnchor: null }),
  requestJump: (groupId, messageId) => set({ pendingJump: { groupId, messageId } }),
  consumeJump: () => set({ pendingJump: null }),
  recordActivity: (pubkey, atMs) => set((state) =>
    atMs <= (state.lastActivityAt[pubkey] ?? 0)
      ? state
      : { lastActivityAt: { ...state.lastActivityAt, [pubkey]: atMs }, presenceTick: Date.now() },
  ),
  bumpPresenceTick: () => set({ presenceTick: Date.now() }),
  reset: () => set(CHAT_INITIAL_STATE),
}));
