import { useWotStore } from '@/store/wot';
import { wotEngine } from './engine';

let initialized = false;

/**
 * Wire the store to the engine and start probing the extension. Idempotent,
 * safe to call from multiple mount points (AppShell + WotSettings).
 */
export function initializeWot(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  initialized = true;
  const s = useWotStore.getState();
  wotEngine.configure({
    enabled: s.enabled && s.status === 'configured',
    maxHops: s.maxHops,
    minPaths: s.minPaths,
  });
  // Expose the engine for manual inspection: `window.wot.stats()`.
  (window as unknown as { wot?: unknown }).wot = wotEngine;
  void s.refreshStatus();
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void useWotStore.getState().refreshStatus();
    }
  });
}
