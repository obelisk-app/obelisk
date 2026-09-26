import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enqueueSignerOp,
  signerQueueStats,
  resetSignerQueue,
  MAX_IN_FLIGHT,
  SignerQueueTimeoutError,
} from './signer-queue';

/** A promise plus the handles to settle it from the test body. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('signer queue', () => {
  beforeEach(() => {
    resetSignerQueue();
  });

  it('runs at most MAX_IN_FLIGHT operations at a time', async () => {
    const gates = [deferred(), deferred(), deferred()];
    let started = 0;
    const results = gates.map((g, i) =>
      enqueueSignerOp('background', `op${i}`, async () => {
        started += 1;
        await g.promise;
        return i;
      }),
    );

    await Promise.resolve();
    expect(started).toBe(MAX_IN_FLIGHT);
    expect(signerQueueStats().inFlight).toBe(MAX_IN_FLIGHT);

    for (const g of gates) g.resolve();
    expect(await Promise.all(results)).toEqual([0, 1, 2]);
    expect(started).toBe(3);
  });

  it('interactive work jumps ahead of a queued background backlog', async () => {
    const order: string[] = [];
    const gate = deferred();

    // Occupy the single slot so everything else has to queue.
    const blocker = enqueueSignerOp('background', 'blocker', async () => {
      order.push('blocker');
      await gate.promise;
    });

    await Promise.resolve();

    const backlog = [0, 1, 2].map((i) =>
      enqueueSignerOp('background', `bg${i}`, async () => {
        order.push(`bg${i}`);
      }),
    );
    // Arrives last, must run first.
    const urgent = enqueueSignerOp('interactive', 'sign', async () => {
      order.push('sign');
    });

    gate.resolve();
    await Promise.all([blocker, urgent, ...backlog]);

    expect(order).toEqual(['blocker', 'sign', 'bg0', 'bg1', 'bg2']);
  });

  it('preserves FIFO order within a lane', async () => {
    const order: number[] = [];
    await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        enqueueSignerOp('interactive', `op${i}`, async () => {
          order.push(i);
        }),
      ),
    );
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('a rejected operation releases the slot instead of wedging the drain', async () => {
    const boom = enqueueSignerOp('background', 'boom', async () => {
      throw new Error('signer said no');
    });
    await expect(boom).rejects.toThrow('signer said no');

    // The queue must still be usable.
    await expect(
      enqueueSignerOp('background', 'after', async () => 'ok'),
    ).resolves.toBe('ok');
    expect(signerQueueStats().inFlight).toBe(0);
  });

  it('a synchronously-throwing operation rejects rather than escaping the drain', async () => {
    const boom = enqueueSignerOp('background', 'sync-boom', () => {
      throw new Error('threw before returning a promise');
    });
    await expect(boom).rejects.toThrow('threw before returning a promise');
    await expect(
      enqueueSignerOp('background', 'after', async () => 'ok'),
    ).resolves.toBe('ok');
  });

  it('reports queue depth per lane', async () => {
    const gate = deferred();
    const blocker = enqueueSignerOp('background', 'blocker', () => gate.promise);
    await Promise.resolve();

    const queued = [
      enqueueSignerOp('background', 'bg', async () => {}),
      enqueueSignerOp('interactive', 'ia', async () => {}),
      enqueueSignerOp('interactive', 'ia', async () => {}),
    ];
    const stats = signerQueueStats();
    expect(stats.interactive).toBe(2);
    expect(stats.background).toBe(1);
    expect(stats.inFlight).toBe(1);

    gate.resolve();
    await Promise.all([blocker, ...queued]);
    expect(signerQueueStats()).toEqual({ interactive: 0, background: 0, inFlight: 0 });
  });

  it('reset rejects everything still queued so callers unwind', async () => {
    const gate = deferred();
    const blocker = enqueueSignerOp('background', 'blocker', () => gate.promise);
    await Promise.resolve();

    const stranded = enqueueSignerOp('interactive', 'stranded', async () => 'never');
    resetSignerQueue();

    await expect(stranded).rejects.toThrow('Signer queue reset');
    expect(signerQueueStats()).toEqual({ interactive: 0, background: 0, inFlight: 0 });

    // Settle the blocker so it doesn't leak into the next test.
    gate.resolve();
    await blocker;
  });

  it('an operation queued after a reset still runs', async () => {
    resetSignerQueue();
    await expect(
      enqueueSignerOp('interactive', 'post-reset', async () => 42),
    ).resolves.toBe(42);
  });});

describe('signer queue start deadline', () => {
  beforeEach(() => {
    resetSignerQueue();
    vi.useFakeTimers();
  });
  afterEach(() => {
    resetSignerQueue();
    vi.useRealTimers();
  });

  it('drops an op that is still queued when its deadline passes, without running it', async () => {
    const blocker = deferred();
    const busy = enqueueSignerOp('interactive', 'busy', () => blocker.promise);
    const run = vi.fn(async () => 'late');
    const stale = enqueueSignerOp('interactive', 'voice-answer', run, { startDeadlineMs: 15_000 });
    const staleResult = expect(stale).rejects.toBeInstanceOf(SignerQueueTimeoutError);

    await vi.advanceTimersByTimeAsync(15_000);
    await staleResult;
    expect(signerQueueStats().interactive).toBe(0);

    blocker.resolve();
    await busy;
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
  });

  it('never interrupts an op that already started', async () => {
    const gate = deferred<string>();
    const started = enqueueSignerOp('interactive', 'slow-signer', () => gate.promise, { startDeadlineMs: 1_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    gate.resolve('signed');
    await expect(started).resolves.toBe('signed');
  });

  it('lets the op run when it reaches the slot before the deadline', async () => {
    const blocker = deferred();
    void enqueueSignerOp('interactive', 'busy', () => blocker.promise);
    const next = enqueueSignerOp('interactive', 'next', async () => 'ok', { startDeadlineMs: 10_000 });
    await vi.advanceTimersByTimeAsync(2_000);
    blocker.resolve();
    await expect(next).resolves.toBe('ok');
    await vi.advanceTimersByTimeAsync(20_000);
  });
});
