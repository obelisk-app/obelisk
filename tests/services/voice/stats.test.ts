import { afterEach, describe, it, expect, vi } from 'vitest';
import { scoreQuality, qualityColor, startStatsMonitor } from '@/services/voice/stats';

describe('scoreQuality', () => {
  it('returns unknown when no metrics are available', () => {
    expect(scoreQuality({ rttMs: null, loss: null, jitterMs: null })).toBe('unknown');
  });

  it('rates pristine links excellent', () => {
    expect(scoreQuality({ rttMs: 30, loss: 0, jitterMs: 5 })).toBe('excellent');
  });

  it('worst dimension wins', () => {
    expect(scoreQuality({ rttMs: 30, loss: 0.5, jitterMs: 5 })).toBe('poor');
    expect(scoreQuality({ rttMs: 250, loss: 0, jitterMs: 5 })).toBe('fair');
  });

  it('high jitter alone degrades the score', () => {
    expect(scoreQuality({ rttMs: 30, loss: 0, jitterMs: 200 })).toBe('poor');
  });
});

describe('qualityColor', () => {
  it('returns distinct colors per level', () => {
    const colors = new Set(['excellent', 'good', 'fair', 'poor', 'unknown'].map((l) =>
      qualityColor(l as 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'),
    ));
    expect(colors.size).toBe(5);
  });
});

describe('startStatsMonitor', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function pc(connectionState: RTCPeerConnectionState) {
    return {
      connectionState,
      getStats: vi.fn(async () => { throw new Error('stats exploded'); }),
    } as unknown as RTCPeerConnection;
  }

  it('reports a failing poll once on a live connection, and keeps polling', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const connection = pc('connected');
    const monitor = startStatsMonitor(connection, () => {});
    await vi.advanceTimersByTimeAsync(2_000 * 3);
    expect(connection.getStats).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[voice] stats poll failed; the quality dot will not update', expect.any(Error));
    monitor.stop();
  });

  it('stays quiet on a connection that is closing', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const monitor = startStatsMonitor(pc('closed'), () => {});
    await vi.advanceTimersByTimeAsync(2_000 * 2);
    expect(warn).not.toHaveBeenCalled();
    monitor.stop();
  });
});
