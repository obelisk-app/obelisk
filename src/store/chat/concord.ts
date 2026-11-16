import { create } from 'zustand';

interface ConcordNavigation {
  open: boolean;
  communityId: string | null;
  channelId: string | null;
  threadId: string | null;
  show: () => void;
  close: () => void;
  selectCommunity: (id: string) => void;
  selectChannel: (id: string) => void;
  selectThread: (channelId: string, threadId: string) => void;
  reset: () => void;
}

/** Navigation only. Protocol state and secrets remain owned by the bridge runtime. */
export const useConcordNavigation = create<ConcordNavigation>(set => ({
  open: false, communityId: null, channelId: null, threadId: null,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
  selectCommunity: communityId => set({ communityId, channelId: null, threadId: null, open: true }),
  selectChannel: channelId => set({ channelId, threadId: null }),
  selectThread: (channelId, threadId) => set({ channelId, threadId }),
  reset: () => set({ open: false, communityId: null, channelId: null, threadId: null }),
}));
