import { describe, it, expect, vi } from 'vitest';
import { withRateLimitBackoff, installBeforeUnloadHandler } from './failure-handlers';
import { emptyVoiceMetrics } from './metrics';

describe('withRateLimitBackoff', () => {
  it('returns immediately when fn succeeds', async () => {
    const metrics = emptyVoiceMetrics();
    const fn = vi.fn(async () => 'ok');
    const result = await withRateLimitBackoff(fn, { metrics });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(metrics.rateLimit.hit).toBe(0);
  });

  it('retries on rate-limit error then succeeds', async () => {
    const metrics = emptyVoiceMetrics();
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error('rate-limit: too many requests');
      return 'finally';
    });
    const sleep = vi.fn(async () => {});
    const result = await withRateLimitBackoff(fn, {
      metrics, delaysMs: [10, 10, 10, 10], sleep,
    });
    expect(result).toBe('finally');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(metrics.rateLimit.hit).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(metrics.rateLimit.backoffMs).toBeGreaterThan(0);
  });

  it('re-throws non-rate-limit errors immediately without retry', async () => {
    const metrics = emptyVoiceMetrics();
    const fn = vi.fn(async () => { throw new Error('signing failed'); });
    await expect(withRateLimitBackoff(fn, { metrics })).rejects.toThrow('signing failed');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(metrics.rateLimit.hit).toBe(0);
  });

  it('gives up after exhausting all delays and calls onGiveUp', async () => {
    const metrics = emptyVoiceMetrics();
    const fn = vi.fn(async () => { throw new Error('rate-limit: nope'); });
    const onGiveUp = vi.fn();
    await expect(withRateLimitBackoff(fn, {
      metrics, delaysMs: [5, 5], sleep: async () => {}, onGiveUp,
    })).rejects.toThrow('rate-limit');
    // 1 initial + 2 retries = 3 attempts
    expect(fn).toHaveBeenCalledTimes(3);
    expect(metrics.rateLimit.hit).toBe(3);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('matches "slow down" relay-rejection text', async () => {
    const metrics = emptyVoiceMetrics();
    let n = 0;
    const fn = async () => {
      n++;
      if (n === 1) throw new Error('please slow down');
      return 'ok';
    };
    const result = await withRateLimitBackoff(fn, {
      metrics, delaysMs: [5], sleep: async () => {},
    });
    expect(result).toBe('ok');
    expect(metrics.rateLimit.hit).toBe(1);
  });
});

describe('installBeforeUnloadHandler', () => {
  it('fires onUnload exactly once on beforeunload', () => {
    const onUnload = vi.fn();
    const handle = installBeforeUnloadHandler({ onUnload });
    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('pagehide'));
    expect(onUnload).toHaveBeenCalledTimes(1);
    handle.uninstall();
  });

  it('uninstall removes the listener', () => {
    const onUnload = vi.fn();
    const handle = installBeforeUnloadHandler({ onUnload });
    handle.uninstall();
    window.dispatchEvent(new Event('beforeunload'));
    expect(onUnload).not.toHaveBeenCalled();
  });

  it('catches handler exceptions silently', () => {
    const onUnload = vi.fn(() => { throw new Error('boom'); });
    const handle = installBeforeUnloadHandler({ onUnload });
    expect(() => window.dispatchEvent(new Event('beforeunload'))).not.toThrow();
    handle.uninstall();
  });
});
