/**
 * The socket-entry helpers the table and the supervisor share: the backoff
 * curve, the eviction order and the waiter bookkeeping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BACKOFF,
  addWaiter,
  createSocketEntry,
  evictionVictim,
  rejectImpatient,
  retryDelay,
  settleWaiters,
  type SocketEntry,
} from '@/lib/relay-hub/socket-entry';
import { FakeRelay } from '@/lib/relay-hub/fake-relay';
import { A, makeSigner, sessionIdentity } from '@/lib/relay-hub/test-support';

function entry(key: string, lastUsedAt: number, extra: Partial<SocketEntry> = {}): SocketEntry {
  return Object.assign(createSocketEntry(key, A, sessionIdentity(makeSigner()), new FakeRelay(A, 'session'), lastUsedAt), extra);
}

describe('socket-entry helpers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('doubles from baseMs up to maxMs, with jitter centred on the nominal delay', () => {
    const delays = [1, 2, 3, 6, 10].map((attempt) => retryDelay(attempt, DEFAULT_BACKOFF, 0.5));
    expect(delays).toEqual([1000, 2000, 4000, 30_000, 30_000]);
    expect(retryDelay(1, DEFAULT_BACKOFF, 0)).toBe(800);
    expect(retryDelay(1, DEFAULT_BACKOFF, 1)).toBe(1200);
  });

  it('evicts grace-window sockets first, then the least recently used idle one, never a held or busy one', () => {
    const held = entry('held', 0, { explicit: true });
    const busy = entry('busy', 1, { busy: 1 });
    const old = entry('old', 2);
    const fresh = entry('fresh', 9);
    expect(evictionVictim([held, busy, fresh, old])?.key).toBe('old');
    const grace = entry('grace', 50, { graceTimer: setTimeout(() => undefined, 1000) });
    expect(evictionVictim([held, busy, fresh, old, grace])?.key).toBe('grace');
    expect(evictionVictim([held, busy])).toBeUndefined();
  });

  it('rejects only fail-fast waiters on a failed attempt; settle resolves or rejects the rest', async () => {
    const e = entry('e', 0);
    const patient = addWaiter(e, 10_000, false);
    const impatient = addWaiter(e, 10_000, true);
    rejectImpatient(e, new Error('attempt failed'));
    await expect(impatient).rejects.toThrow('attempt failed');
    expect(e.waiters).toHaveLength(1);
    settleWaiters(e, null);
    await expect(patient).resolves.toBeUndefined();
    const late = addWaiter(e, 10_000, false);
    settleWaiters(e, new Error('closed'));
    await expect(late).rejects.toThrow('closed');
  });

  it('a waiter times out on its own and leaves the list', async () => {
    const e = entry('e', 0);
    const waiting = addWaiter(e, 500, false);
    const caught = waiting.catch((err: unknown) => (err instanceof Error ? err.message : ''));
    await vi.advanceTimersByTimeAsync(500);
    expect(await caught).toBe(`relay ${A} unreachable (idle)`);
    expect(e.waiters).toHaveLength(0);
  });
});
