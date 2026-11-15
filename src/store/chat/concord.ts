import { create } from 'zustand';

interface ConcordNavigation {
  open: boolean;
  communityId: string | null;
  channelId: string | null;
  show: () => void;
  close: () => void;
  selectCommunity: (id: string) => void;
  selectChannel: (id: string) => void;
  reset: () => void;
}

/** Navigation only. Protocol state and secrets remain owned by the bridge runtime. */
export const useConcordNavigation = create<ConcordNavigation>(set => ({
  open: false, communityId: null, channelId: null,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
  selectCommunity: communityId => set({ communityId, channelId: null, open: true }),
  selectChannel: channelId => set({ channelId }),
  reset: () => set({ open: false, communityId: null, channelId: null }),
}));
