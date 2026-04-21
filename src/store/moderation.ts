import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ModerationState {
  mutedPubkeys: string[];
  blockedPubkeys: string[];
  isMuted: (pubkey: string) => boolean;
  isBlocked: (pubkey: string) => boolean;
  toggleMute: (pubkey: string) => boolean;
  toggleBlock: (pubkey: string) => boolean;
}

export const useModerationStore = create<ModerationState>()(
  persist(
    (set, get) => ({
      mutedPubkeys: [],
      blockedPubkeys: [],
      isMuted: (pubkey) => get().mutedPubkeys.includes(pubkey),
      isBlocked: (pubkey) => get().blockedPubkeys.includes(pubkey),
      toggleMute: (pubkey) => {
        const list = get().mutedPubkeys;
        const has = list.includes(pubkey);
        set({ mutedPubkeys: has ? list.filter((p) => p !== pubkey) : [...list, pubkey] });
        return !has;
      },
      toggleBlock: (pubkey) => {
        const list = get().blockedPubkeys;
        const has = list.includes(pubkey);
        set({ blockedPubkeys: has ? list.filter((p) => p !== pubkey) : [...list, pubkey] });
        return !has;
      },
    }),
    {
      name: 'obelisk:moderation',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
