import { create } from 'zustand';

interface ConcordNavigation {
  open: boolean;
  membersOpen: boolean;
  mobileChannelsOpen: boolean;
  setMobileChannelsOpen: (open: boolean) => void;
  setMembersOpen: (open: boolean) => void;
  communityId: string | null;
  channelId: string | null;
  threadId: string | null;
  show: () => void;
  close: () => void;
  selectCommunity: (id: string, showChannels?: boolean) => void;
  selectChannel: (id: string) => void;
  selectThread: (channelId: string, threadId: string) => void;
  reset: () => void;
}

/** Navigation only. Protocol state and secrets remain owned by the bridge runtime. */
export const useConcordNavigation = create<ConcordNavigation>(set => ({
  mobileChannelsOpen: false, setMobileChannelsOpen: mobileChannelsOpen => set({ mobileChannelsOpen }),
  membersOpen: false, setMembersOpen: membersOpen => set({ membersOpen }),
  open: false, communityId: null, channelId: null, threadId: null,
  show: () => set({ open: true }),
  close: () => set({ open: false, membersOpen: false, mobileChannelsOpen: false }),
  selectCommunity: (communityId, showChannels = false) => set({ mobileChannelsOpen: showChannels, membersOpen: false, communityId, channelId: null, threadId: null, open: true }),
  selectChannel: channelId => set({ channelId, threadId: null, mobileChannelsOpen: false }),
  selectThread: (channelId, threadId) => set({ channelId, threadId, mobileChannelsOpen: false }),
  reset: () => set({ mobileChannelsOpen: false, membersOpen: false, open: false, communityId: null, channelId: null, threadId: null }),
}));
