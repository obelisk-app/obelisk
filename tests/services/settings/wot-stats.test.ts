import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchWotStats } from '@/services/settings/wot-stats';

afterEach(() => vi.useRealTimers());

describe('watchWotStats', () => {
  it('reports now, on every verdict change and every 1.5 s, until stopped', () => {
    vi.useFakeTimers();
    let n = 0;
    let changed: (() => void) | null = null;
    const off = vi.fn();
    const engine = {
      stats: () => ({ allow: ++n, deny: 0, pending: 0 }),
      on: vi.fn((_event: string, cb: () => void) => { changed = cb; return off; }),
    };
    const seen: number[] = [];
    const stop = watchWotStats((s) => seen.push(s.allow), engine as never);
    expect(seen).toEqual([1]);
    expect(engine.on).toHaveBeenCalledWith('verdicts-changed', expect.any(Function));
    changed!();
    expect(seen).toEqual([1, 2]);
    vi.advanceTimersByTime(1500);
    expect(seen).toEqual([1, 2, 3]);
    stop();
    expect(off).toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(seen).toHaveLength(3);
  });
});
