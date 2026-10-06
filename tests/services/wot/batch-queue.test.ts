/**
 * The WoT lookup queue: debounced, one batch in flight, re-armed for what
 * queued meanwhile, and a cancel disowns the batch on the wire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchQueue } from '@/services/wot/batch-queue';
import { WotEvents } from '@/services/wot/engine-events';

function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('BatchQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces adds within the debounce into one batch', async () => {
    const fetch = vi.fn(async (batch: string[]) => batch.length);
    const deliver = vi.fn();
    const q = new BatchQueue(100, fetch, deliver);
    q.add('a');
    q.add('b');
    q.add('a');
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(['a', 'b'], 2);
  });

  it('never runs two fetches at once, and re-arms for what queued meanwhile', async () => {
    const first = deferred<number>();
    const fetch = vi.fn((batch: string[]) => (batch[0] === 'a' ? first.promise : Promise.resolve(1)));
    const deliver = vi.fn();
    const q = new BatchQueue(100, fetch, deliver);
    q.add('a');
    await vi.advanceTimersByTimeAsync(100);
    q.add('b');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    first.resolve(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toEqual(['b']);
  });

  it('cancel drops the queue and discards the in-flight answer', async () => {
    const answer = deferred<number>();
    const deliver = vi.fn();
    const q = new BatchQueue(100, () => answer.promise, deliver);
    q.add('a');
    const flushing = q.flushNow();
    q.add('b');
    q.cancel();
    expect(q.size).toBe(0);
    answer.resolve(1);
    await flushing;
    expect(deliver).not.toHaveBeenCalled();
  });
});

describe('WotEvents', () => {
  it('a throwing listener does not stop the others', () => {
    const events = new WotEvents();
    const seen: string[] = [];
    events.onDeny(() => { throw new Error('boom'); });
    const off = events.onDeny((pk) => seen.push(pk));
    events.fireDeny('x');
    off();
    events.fireDeny('y');
    expect(seen).toEqual(['x']);
  });
});
