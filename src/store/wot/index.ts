/**
 * Persisted WoT settings + extension status. Drives the engine config.
 *
 * Persisted bits: `enabled`, `maxHops`. The probe `status` is volatile:
 * recomputed on app mount and on `visibilitychange` so swapping the
 * extension on/off without a reload reflects in the UI.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { quotaSafeLocalStorage } from '@/services/common/quota-safe-storage';
import { wotEngine } from '@/services/wot/engine';
import { wotProbe, type WotStatus } from '@/services/wot/extension';

interface WotState {
  enabled: boolean;
  maxHops: number;
  minPaths: number;
  status: WotStatus;
  setEnabled: (next: boolean) => void;
  setMaxHops: (hops: number) => void;
  setMinPaths: (paths: number) => void;
  setStatus: (status: WotStatus) => void;
  refreshStatus: () => Promise<void>;
}

export const useWotStore = create<WotState>()(
  persist(
    (set, get) => ({
      enabled: false,
      maxHops: 2,
      minPaths: 1,
      status: 'absent',
      setEnabled: (next) => {
        set({ enabled: next });
        wotEngine.configure({ enabled: next && get().status === 'configured' });
      },
      setMaxHops: (hops) => {
        const clamped = Math.max(1, Math.min(4, Math.floor(hops)));
        set({ maxHops: clamped });
        wotEngine.configure({ maxHops: clamped });
      },
      setMinPaths: (paths) => {
        const clamped = Math.max(1, Math.min(3, Math.floor(paths)));
        set({ minPaths: clamped });
        wotEngine.configure({ minPaths: clamped });
      },
      setStatus: (status) => {
        set({ status });
        // Engine should only run when the extension is actually configured.
        wotEngine.configure({ enabled: get().enabled && status === 'configured' });
      },
      refreshStatus: async () => {
        const probe = await wotProbe();
        get().setStatus(probe.status);
      },
    }),
    {
      name: 'obelisk:wot',
      storage: createJSONStorage(() => quotaSafeLocalStorage),
      partialize: (s) => ({ enabled: s.enabled, maxHops: s.maxHops, minPaths: s.minPaths }),
    },
  ),
);

