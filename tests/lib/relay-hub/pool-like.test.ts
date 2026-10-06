/**
 * The `SimplePool`-shaped facade keeps nostr-tools' aggregation semantics
 * while riding the hub's registry, so `setPool(hub.poolLike())` is a drop-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { A, B, advance, fakeEvent, flush, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

describe('PoolLike facade', () => {
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

  it('subscribeMany fires oneose once for all relays, dedupes event ids across relays, and onclose once with per-relay reasons', async () => {
    const pool = t.hub.poolLike();
    const events: NostrEvent[] = [];
    let eose = 0;
    const reasons: string[][] = [];
    const closer = pool.subscribeMany([A, B], { kinds: [1] }, {
      onevent: (e) => events.push(e),
      oneose: () => eose++,
      onclose: (r) => reasons.push(r),
    });
    await flush();
    const ra = t.factory.get(A);
    const rb = t.factory.get(B);
    if (!ra || !rb) throw new Error('no relay');
    const ev = fakeEvent({ kind: 1 });
    ra.emit(ev);
    rb.emit(ev);
    expect(events).toEqual([ev]);
    ra.eose();
    expect(eose).toBe(0);
    rb.eose();
    expect(eose).toBe(1);
    closer.close();
    expect(reasons).toEqual([['closed by caller', 'closed by caller']]);
    expect(ra.openSubs()).toHaveLength(0);
    expect(rb.openSubs()).toHaveLength(0);
  });

  it('shares the hub registry: a facade sub and a hub sub with the same filter are one REQ', async () => {
    const pool = t.hub.poolLike();
    const h = t.hub.subscribe({ relays: [A], filters: [{ kinds: [1], limit: 20 }], onEvent: () => undefined });
    const closer = pool.subscribeMany([A], { limit: 20, kinds: [1] }, { onevent: () => undefined });
    await flush();
    expect(t.factory.get(A)?.reqLog).toHaveLength(1);
    closer.close();
    expect(t.factory.get(A)?.openSubs()).toHaveLength(1);
    h.release();
    expect(t.factory.get(A)?.openSubs()).toHaveLength(0);
  });

  it('subscribeManyEose closes each relay at its EOSE', async () => {
    const pool = t.hub.poolLike();
    let closed: string[] | null = null;
    pool.subscribeManyEose([A], { kinds: [0] }, { onevent: () => undefined, onclose: (r) => (closed = r) });
    await flush();
    const ra = t.factory.get(A);
    if (!ra) throw new Error('no relay');
    ra.eose();
    expect(ra.openSubs()).toHaveLength(0);
    expect(closed).toEqual(['closed by caller']);
  });

  it('querySync and get route through the query path', async () => {
    const pool = t.hub.poolLike();
    const p = pool.querySync([A], { kinds: [0] }, { maxWait: 1000 });
    await flush();
    const ra = t.factory.get(A);
    if (!ra) throw new Error('no relay');
    const ev = fakeEvent({ kind: 0 });
    ra.emit(ev);
    ra.eose();
    expect(await p).toEqual([ev]);
    const g = pool.get([A], { kinds: [0] });
    await flush();
    ra.emit(fakeEvent({ kind: 0, created_at: 5 }));
    const newest = fakeEvent({ kind: 0, created_at: 9 });
    ra.emit(newest);
    ra.eose();
    expect(await g).toEqual(newest);
  });

  it('publish returns one promise per relay that resolves on OK and rejects on refusal', async () => {
    const pool = t.hub.poolLike();
    const ev = fakeEvent({ kind: 1 });
    const [pa, pb] = pool.publish([A, B], ev);
    await flush();
    const rb = t.factory.get(B);
    if (!rb) throw new Error('no relay');
    rb.autoAck = false;
    await expect(pa).resolves.toBe('');
    // B was already published with autoAck before we flipped it; publish a second event to exercise rejection.
    const ev2 = fakeEvent({ kind: 1 });
    const [pb2] = pool.publish([B], ev2);
    await flush();
    rb.rejectPublish(ev2.id, 'blocked: spam');
    await expect(pb2).rejects.toThrow('blocked: spam');
    await pb;
  });

  it('ensureRelay, listConnectionStatus and close map onto the session identity', async () => {
    const pool = t.hub.poolLike();
    const p = pool.ensureRelay(A);
    await flush();
    const relay = await p;
    expect(relay).toBe(t.factory.get(A));
    expect(pool.listConnectionStatus()).toEqual(new Map([[A, true]]));
    pool.close([A]);
    expect(pool.listConnectionStatus()).toEqual(new Map());
    pool.destroy();
    await advance(0);
  });
});
