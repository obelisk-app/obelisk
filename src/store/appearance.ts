import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId = 'lc-default';
export type MessageDensity = 'cozy' | 'compact';

interface AppearanceState {
  theme: ThemeId;
  density: MessageDensity;
  reducedMotion: boolean;
  setTheme: (t: ThemeId) => void;
  setDensity: (d: MessageDensity) => void;
  setReducedMotion: (v: boolean) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: 'lc-default',
      density: 'cozy',
      reducedMotion: false,
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    }),
    { name: 'obelisk:appearance' },
  ),
);
