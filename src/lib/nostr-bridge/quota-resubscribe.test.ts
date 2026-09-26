import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resubscribeOnQuotaClose, type QuotaResubscribeHooks } from './quota-resubscribe';

describe('resubscribeOnQuotaClose', () => {
  let opened: QuotaResubscribeHooks[];
  let closes: ReturnType<typeof vi.fn>[];
  const open = (hooks: QuotaResubscribeHooks) => {
    opened.push(hooks);
    const close = vi.fn();
    closes.push(close);
    return close;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    opened = [];
    closes = [];
  });
  afterEach(() => vi.useRealTimers());

  it('reopens after a quota close on a growing, capped backoff', () => {
    resubscribeOnQuotaClose(open, { random: () => 0.5 });
    expect(opened).toHaveLength(1);

    const expected = [5_000, 10_000, 20_000, 60_000, 60_000];
    for (const [i, delay] of expected.entries()) {
      opened[i].onQuotaOrRateLimitClose();
      vi.advanceTimersByTime(delay - 1);
      expect(opened).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(opened).toHaveLength(i + 2);
    }
  });

  it('resets the backoff once the relay serves the sub again', () => {
    resubscribeOnQuotaClose(open, { random: () => 0.5 });
    opened[0].onQuotaOrRateLimitClose();
    vi.advanceTimersByTime(5_000);
    opened[1].onQuotaOrRateLimitClose();
    vi.advanceTimersByTime(10_000);
    opened[2].alive();
    opened[2].onQuotaOrRateLimitClose();
    vi.advanceTimersByTime(5_000);
    expect(opened).toHaveLength(4);
  });

  it('reports degraded on close and recovered on the first sign of life', () => {
    const onDegraded = vi.fn();
    resubscribeOnQuotaClose(open, { onDegraded, random: () => 0.5 });
    opened[0].alive();
    expect(onDegraded).not.toHaveBeenCalled();
    opened[0].onQuotaOrRateLimitClose();
    expect(onDegraded).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(5_000);
    opened[1].alive();
    expect(onDegraded).toHaveBeenLastCalledWith(false);
    expect(onDegraded).toHaveBeenCalledTimes(2);
  });

  it('close() cancels a pending reopen and closes the live sub', () => {
    const stop = resubscribeOnQuotaClose(open, { random: () => 0.5 });
    opened[0].onQuotaOrRateLimitClose();
    stop();
    vi.advanceTimersByTime(120_000);
    expect(opened).toHaveLength(1);

    const stop2 = resubscribeOnQuotaClose(open);
    stop2();
    expect(closes[1]).toHaveBeenCalledTimes(1);
  });

  it('ignores hooks from a superseded generation', () => {
    const onDegraded = vi.fn();
    resubscribeOnQuotaClose(open, { onDegraded, random: () => 0.5 });
    opened[0].onQuotaOrRateLimitClose();
    vi.advanceTimersByTime(5_000);
    opened[0].onQuotaOrRateLimitClose();
    opened[0].alive();
    expect(opened).toHaveLength(2);
    vi.advanceTimersByTime(120_000);
    expect(opened).toHaveLength(2);
    expect(onDegraded).toHaveBeenCalledTimes(1);
  });
});
