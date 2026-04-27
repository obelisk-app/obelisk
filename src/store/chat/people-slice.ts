import type { StateCreator } from 'zustand';
import type { ChatState } from './index';
import type { MemberInfo } from './types';

export interface PeopleSlice {
  // Members (for mentions autocomplete)
  memberList: MemberInfo[];

  // Profile popover — when non-null, ProfilePopover is shown for this pubkey.
  profilePopupPubkey: string | null;

  // Presence: pubkeys currently connected via Socket.io
  onlinePubkeys: Set<string>;

  // Typing indicator
  typingUsers: Record<string, number>; // pubkey -> timeout id

  openProfilePopup: (pubkey: string) => void;
  closeProfilePopup: () => void;

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

  // Typing
  setTyping: (pubkey: string) => void;
  clearTyping: (pubkey: string) => void;

  // Presence
  setOnlinePubkeys: (pubkeys: string[]) => void;
  setPresence: (pubkey: string, online: boolean) => void;
}

export const PEOPLE_INITIAL_STATE = {
  memberList: [] as MemberInfo[],
  profilePopupPubkey: null as string | null,
  onlinePubkeys: new Set<string>(),
  typingUsers: {} as Record<string, number>,
};

export const createPeopleSlice: StateCreator<ChatState, [], [], PeopleSlice> = (set, get) => ({
  ...PEOPLE_INITIAL_STATE,

  openProfilePopup: (pubkey) => set({ profilePopupPubkey: pubkey }),
  closeProfilePopup: () => set({ profilePopupPubkey: null }),

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

  setTyping: (pubkey) => set((state) => {
    // Clear existing timeout for this user if any
    if (state.typingUsers[pubkey]) {
      clearTimeout(state.typingUsers[pubkey]);
    }
    const timeoutId = window.setTimeout(() => {
      get().clearTyping(pubkey);
    }, 3000);
    return { typingUsers: { ...state.typingUsers, [pubkey]: timeoutId } };
  }),
  clearTyping: (pubkey) => set((state) => {
    const { [pubkey]: _, ...rest } = state.typingUsers;
    return { typingUsers: rest };
  }),

  setOnlinePubkeys: (pubkeys) => set({ onlinePubkeys: new Set(pubkeys) }),
  setPresence: (pubkey, online) => set((state) => {
    const next = new Set(state.onlinePubkeys);
    if (online) next.add(pubkey);
    else next.delete(pubkey);
    return { onlinePubkeys: next };
  }),
});
