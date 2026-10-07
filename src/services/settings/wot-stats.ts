import { wotEngine } from '@/services/wot';

export type WotStats = ReturnType<typeof wotEngine.stats>;

type StatsSource = Pick<typeof wotEngine, 'stats' | 'on'>;

/**
 * Report the engine's allow / deny / pending counts now, whenever its
 * verdicts change, and every 1.5 s (pending work settles without an event).
 * Returns the unsubscribe.
 */
export function watchWotStats(onStats: (stats: WotStats) => void, engine: StatsSource = wotEngine): () => void {
  const refresh = () => onStats(engine.stats());
  refresh();
  const off = engine.on('verdicts-changed', refresh);
  const timer = setInterval(refresh, 1500);
  return () => {
    off();
    clearInterval(timer);
  };
}
