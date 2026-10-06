import { describe, expect, it, vi } from 'vitest';
import { clearRinging, rt } from '@/store/dm-call-runtime';

describe('dm-call-runtime', () => {
  it('clearRinging stops the ring sound and its timeout, once', () => {
    vi.useFakeTimers();
    const fired = vi.fn();
    const stop = vi.fn();
    rt.ringTimer = setTimeout(fired, 1000) as unknown as typeof rt.ringTimer;
    rt.stopRing = stop;

    clearRinging();
    clearRinging();
    vi.advanceTimersByTime(2000);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(fired).not.toHaveBeenCalled();
    expect(rt.ringTimer).toBeNull();
    expect(rt.stopRing).toBeNull();
    vi.useRealTimers();
  });
});
