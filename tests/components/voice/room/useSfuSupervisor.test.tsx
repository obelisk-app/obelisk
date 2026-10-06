/**
 * The SFU supervisor's publish / watchdog / retry ladder, driven on fake
 * timers. It had no direct test: the room tests mock `ensureSfuRoomStarted`
 * to null and never advance the clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import type { SfuStatus } from '@/components/voice/room/header';

const sfuControl = vi.hoisted(() => ({ ensureSfuRoomStarted: vi.fn(async (): Promise<string | null> => null) }));
vi.mock('@/services/voice/sfu-control', () => ({ ensureSfuRoomStarted: sfuControl.ensureSfuRoomStarted }));

import { useSfuSupervisor } from '@/components/voice/room/useSfuSupervisor';

const SFU = 'f'.repeat(64);

function statusTracker() {
  let status: SfuStatus = 'na';
  const setSfuStatus = vi.fn((u: SetStateAction<SfuStatus>) => {
    status = typeof u === 'function' ? u(status) : u;
  }) as unknown as Dispatch<SetStateAction<SfuStatus>> & { mock: { calls: unknown[][] } };
  return { setSfuStatus, status: () => status, set: (s: SfuStatus) => { status = s; } };
}

beforeEach(() => {
  vi.useFakeTimers();
  sfuControl.ensureSfuRoomStarted.mockReset();
  sfuControl.ensureSfuRoomStarted.mockResolvedValue(null);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useSfuSupervisor', () => {
  it('does nothing until the gate is ready and the user has joined, and reports na for a mesh channel', async () => {
    const t = statusTracker();
    const { rerender } = renderHook(
      ({ active, expectSfu }) => useSfuSupervisor({ active, expectSfu, channelId: 'ch', republishCounter: 0, setSfuStatus: t.setSfuStatus }),
      { initialProps: { active: false, expectSfu: true } },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(sfuControl.ensureSfuRoomStarted).not.toHaveBeenCalled();
    rerender({ active: true, expectSfu: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.status()).toBe('na');
    expect(sfuControl.ensureSfuRoomStarted).not.toHaveBeenCalled();
  });

  it('publishes start without force on first entry, with force on a republish', async () => {
    sfuControl.ensureSfuRoomStarted.mockResolvedValue(SFU);
    const t = statusTracker();
    const { rerender } = renderHook(
      ({ counter }) => useSfuSupervisor({ active: true, expectSfu: true, channelId: 'ch', republishCounter: counter, setSfuStatus: t.setSfuStatus }),
      { initialProps: { counter: 0 } },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenLastCalledWith('ch', undefined, { force: false });
    expect(t.status()).toBe('starting');
    rerender({ counter: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenLastCalledWith('ch', undefined, { force: true });
  });

  it('reports unavailable when no SFU advertises, and tries again every 15 s', async () => {
    const t = statusTracker();
    renderHook(() => useSfuSupervisor({ active: true, expectSfu: true, channelId: 'ch', republishCounter: 0, setSfuStatus: t.setSfuStatus }));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.status()).toBe('unavailable');
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenCalledTimes(2);
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenLastCalledWith('ch', undefined, { force: true });
  });

  it('retries twice when the SFU beacon never arrives, then gives up as unauthorized', async () => {
    sfuControl.ensureSfuRoomStarted.mockResolvedValue(SFU);
    const t = statusTracker();
    renderHook(() => useSfuSupervisor({ active: true, expectSfu: true, channelId: 'ch', republishCounter: 0, setSfuStatus: t.setSfuStatus }));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.status()).toBe('starting');
    // Watchdog 25 s, then 5 s backoff; watchdog, then 10 s; watchdog, give up.
    await vi.advanceTimersByTimeAsync(25_000 + 5_000);
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(25_000 + 10_000);
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(t.status()).toBe('unauthorized');
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenCalledTimes(3);
  });

  it('stops retrying once the topology reports the SFU connected', async () => {
    sfuControl.ensureSfuRoomStarted.mockResolvedValue(SFU);
    const t = statusTracker();
    renderHook(() => useSfuSupervisor({ active: true, expectSfu: true, channelId: 'ch', republishCounter: 0, setSfuStatus: t.setSfuStatus }));
    await vi.advanceTimersByTimeAsync(0);
    t.set('connected'); // what onTopologyChange(sfu) does in the room
    await vi.advanceTimersByTimeAsync(60_000);
    // Republishing kind 25052 while a session is up would kick the live call.
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenCalledTimes(1);
    expect(t.status()).toBe('connected');
  });

  it('clears its timers on unmount so nothing publishes after the room is gone', async () => {
    const t = statusTracker();
    const { unmount } = renderHook(() => useSfuSupervisor({ active: true, expectSfu: true, channelId: 'ch', republishCounter: 0, setSfuStatus: t.setSfuStatus }));
    await vi.advanceTimersByTimeAsync(0);
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenCalledTimes(1);
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sfuControl.ensureSfuRoomStarted).toHaveBeenCalledTimes(1);
  });

  it('a throwing ensureSfuRoomStarted is reported and treated as unavailable', async () => {
    sfuControl.ensureSfuRoomStarted.mockRejectedValue(new Error('relay down'));
    const t = statusTracker();
    renderHook(() => useSfuSupervisor({ active: true, expectSfu: true, channelId: 'ch', republishCounter: 0, setSfuStatus: t.setSfuStatus }));
    await vi.advanceTimersByTimeAsync(0);
    expect(console.warn).toHaveBeenCalledWith('[voice] ensureSfuRoomStarted threw', expect.any(Error));
    expect(t.status()).toBe('unavailable');
  });
});
