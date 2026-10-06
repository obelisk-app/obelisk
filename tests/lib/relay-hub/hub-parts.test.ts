/**
 * The small pieces `hub.ts` composes: the status feed and idle row, the
 * bound hub view, the env-driven visibility source, the publish ack timer
 * and the lease policy's URL guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelayStatus } from '@/lib/relay-hub/types';
import { StatusFeed, idleStatus, socketStatus } from '@/lib/relay-hub/hub-status';
import { bindHub } from '@/lib/relay-hub/hub-adapters';
import { withTimeout } from '@/lib/relay-hub/hub-publish';
import { A, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

describe('hub parts', () => {
  let t: TestHub;

  beforeEach(() => {
    vi.useFakeTimers();
    t = makeHub();
    t.hub.setIdentity(sessionIdentity(makeSigner()));
  });
  afterEach(() => {
    t.hub.dispose();
    vi.useRealTimers();
  });

  it('idleStatus describes a relay with no socket, under the given budget', () => {
    expect(idleStatus('wss://relay-a.example', 'session', 40)).toEqual({
      url: A,
      identityId: 'session',
      connection: 'idle',
      auth: 'none',
      socketGeneration: 0,
      promptCount: 0,
      openSubs: 0,
      budget: { used: 0, max: 40, parked: 0 },
      lastError: null,
      authError: null,
    });
  });

  it('StatusFeed builds a row only while someone listens, and stops after unsubscribe', () => {
    const entry = t.hub.sockets.ensure(A, sessionIdentity(makeSigner()));
    const statusOf = vi.fn((e: typeof entry) => socketStatus(e, t.hub.auth, t.hub.registry));
    const feed = new StatusFeed(statusOf);
    feed.emit(entry);
    expect(statusOf).not.toHaveBeenCalled();
    const seen: RelayStatus[] = [];
    const off = feed.subscribe((s) => seen.push(s));
    feed.emit(entry);
    expect(seen.map((s) => s.url)).toEqual([A]);
    off();
    feed.emit(entry);
    expect(seen).toHaveLength(1);
    expect(statusOf).toHaveBeenCalledTimes(1);
  });

  it('bindHub keeps methods bound to the hub when spread', () => {
    const view = { ...bindHub(t.hub) };
    expect(view.status(A).url).toBe(A);
    expect(view.getIdentity('session')?.id).toBe('session');
  });

  it('withTimeout rejects with the ack marker after the window, and passes a settled value through', async () => {
    const slow = withTimeout(new Promise<string>(() => undefined), 100);
    const caught = slow.catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
    await vi.advanceTimersByTimeAsync(100);
    expect(await caught).toBe('hub: publish ack timed out');
    await expect(withTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok');
    await expect(withTimeout(Promise.reject(new Error('blocked: no')), 100)).rejects.toThrow('blocked: no');
  });

  it('an unparseable URL holds no lease', () => {
    expect(t.hub.leaseCount('not a url')).toBe(0);
  });
});
