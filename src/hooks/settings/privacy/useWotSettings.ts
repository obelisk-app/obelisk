'use client';

import { useEffect, useState } from 'react';
import { initializeWot, useWotStore, wotEngine } from '@/services/wot';
import { watchWotStats } from '@/services/settings/wot-stats';
import { wotStatusView } from '@/utils/settings/wot-status';

/**
 * The WoT settings: the switch (live only while the extension answers), the
 * two sliders, the extension status and the engine's counts. The probe runs
 * on mount and again whenever the tab regains focus (`initializeWot`).
 */
export function useWotSettings() {
  const enabled = useWotStore((s) => s.enabled);
  const maxHops = useWotStore((s) => s.maxHops);
  const minPaths = useWotStore((s) => s.minPaths);
  const status = useWotStore((s) => s.status);
  const setEnabled = useWotStore((s) => s.setEnabled);
  const setMaxHops = useWotStore((s) => s.setMaxHops);
  const setMinPaths = useWotStore((s) => s.setMinPaths);
  const refreshStatus = useWotStore((s) => s.refreshStatus);
  const [stats, setStats] = useState(() => wotEngine.stats());

  useEffect(() => {
    initializeWot();
  }, []);
  useEffect(() => watchWotStats(setStats), []);

  const canEnable = status === 'configured';
  return {
    active: enabled && canEnable,
    canEnable,
    toggle: () => setEnabled(!enabled),
    status: wotStatusView(status),
    recheck: () => void refreshStatus(),
    maxHops,
    setMaxHops: (value: string) => setMaxHops(Number(value)),
    minPaths,
    setMinPaths: (value: string) => setMinPaths(Number(value)),
    stats,
  };
}
