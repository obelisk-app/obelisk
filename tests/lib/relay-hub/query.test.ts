/**
 * One-shot queries: in-flight dedupe, the byte-bounded result cache, and
 * the identity namespace on the key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUERY_OPTIONS } from '@/lib/relay-hub/query';
import { A, B, advance, ephemeralIdentity, fakeEvent, flush, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

describe('query path', () => {
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

  it('two in-flight identical queries share one REQ and one promise; a third within the TTL is served from cache', async () => {
    const q1 = t.hub.query({ relays: [A], filters: [{ kinds: [0], authors: ['ab'] }] });
    const q2 = t.hub.query({ relays: [A], filters: [{ authors: ['AB'], kinds: [0] }] });
    expect(q1).toBe(q2);
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(relay.reqLog).toHaveLength(1);
    const ev = fakeEvent({ kind: 0, pubkey: 'ab' });
    relay.emit(ev);
    relay.eose();
    const r1 = await q1;
    expect(r1.events).toEqual([ev]);
    expect(r1.complete).toBe(true);
    expect(r1.perRelay).toEqual({ [A]: 'eose' });
    expect(relay.openSubs()).toHaveLength(0); // CLOSE on EOSE

    const r3 = await t.hub.query({ relays: [A], filters: [{ kinds: [0], authors: ['ab'] }] });
    expect(r3.fromCache).toBe(true);
    expect(r3.events).toEqual([ev]);
    expect(relay.reqLog).toHaveLength(1);

    const q4 = t.hub.query({ relays: [A], filters: [{ kinds: [0], authors: ['ab'] }], cache: { mode: 'fresh' } });
    await flush();
    expect(relay.reqLog).toHaveLength(2);
    relay.eose();
    await q4;
  });

  it('settles on maxWait with complete: false, and caches that only for the short TTL', async () => {
    const q = t.hub.query({ relays: [A, B], filters: [{ kinds: [0] }], maxWaitMs: 1000 });
    await flush();
    t.factory.get(A)?.eose();
    await advance(1000);
    const r = await q;
    expect(r.complete).toBe(false);
    expect(r.perRelay).toEqual({ [A]: 'eose', [B]: 'timeout' });

    await advance(DEFAULT_QUERY_OPTIONS.incompleteTtlMs - 1);
    expect((await t.hub.query({ relays: [A, B], filters: [{ kinds: [0] }], maxWaitMs: 1 })).fromCache).toBe(true);
    await advance(1);
    const again = t.hub.query({ relays: [A, B], filters: [{ kinds: [0] }], maxWaitMs: 1000 });
    await flush();
    expect(t.factory.get(A)?.reqLog).toHaveLength(2);
    await advance(1000);
    await again;
  });

  it('an unreachable relay is reported, not awaited forever', async () => {
    const relayB = { ref: null as null | ReturnType<typeof t.factory.get> };
    const q = t.hub.query({ relays: [A, B], filters: [{ kinds: [0] }], maxWaitMs: 2000 });
    await flush();
    relayB.ref = t.factory.get(B);
    if (!relayB.ref) throw new Error('no relay');
    relayB.ref.drop(); // a query-only socket is not revived
    t.factory.get(A)?.eose();
    await advance(2000);
    const r = await q;
    expect(r.perRelay[A]).toBe('eose');
    expect(r.perRelay[B]).toBe('closed');
    expect(r.complete).toBe(false);
  });

  it('namespaces results by identity so a per-recipient answer never leaks across identities', async () => {
    t.hub.setIdentity(ephemeralIdentity('call1', makeSigner()));
    const filters = [{ kinds: [1059], '#p': ['me'] }];
    const qs = t.hub.query({ relays: [A], filters });
    const qe = t.hub.query({ relays: [A], filters, identityId: 'ephemeral:call1' });
    expect(qs).not.toBe(qe);
    await flush();
    const rs = t.factory.get(A, 'session');
    const re = t.factory.get(A, 'ephemeral:call1');
    if (!rs || !re) throw new Error('no relay');
    rs.emit(fakeEvent({ kind: 1059, tags: [['p', 'me']], content: 'session wrap' }));
    rs.eose();
    re.eose();
    expect((await qs).events.map((e) => e.content)).toEqual(['session wrap']);
    expect((await qe).events).toEqual([]);
    const cached = await t.hub.query({ relays: [A], filters, identityId: 'ephemeral:call1' });
    expect(cached.fromCache).toBe(true);
    expect(cached.events).toEqual([]);
    t.hub.removeIdentity('ephemeral:call1');
    expect(t.hub.queries.cache.keys().some((k) => k.startsWith('ephemeral:call1|'))).toBe(false);
  });

  it('the result cache holds its byte budget under 50 inserts of ~100 KB each', async () => {
    for (let i = 0; i < 50; i++) {
      const q = t.hub.query({ relays: [A], filters: [{ kinds: [1], '#t': [`topic${i}`] }] });
      await flush();
      const relay = t.factory.get(A);
      if (!relay) throw new Error('no relay');
      relay.emit(fakeEvent({ kind: 1, tags: [['t', `topic${i}`]], content: 'z'.repeat(100_000) }));
      relay.eose();
      await q;
    }
    expect(t.hub.queries.cache.bytes).toBeLessThanOrEqual(DEFAULT_QUERY_OPTIONS.maxBytes);
    expect(t.hub.queries.cache.size).toBeLessThanOrEqual(20);
    expect(t.hub.queries.cache.size).toBeGreaterThan(0);
  });

  it('a relay EOSE-then-CLOSED in the same tick settles closed (uncertain), the label rides the REQ, and nostr-tools\' synthetic EOSE is kept behind the deadline', async () => {
    const q = t.hub.query({ relays: [A], filters: [{ kinds: [0] }], maxWaitMs: 2000, label: 'obelisk-query' });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    const sub = relay.subs.get(relay.reqLog[0].id);
    expect(sub?.params.label).toBe('obelisk-query');
    expect(sub?.params.eoseTimeout).toBe(3000);
    // What nostr-tools does for a relay-sent CLOSED: synthetic EOSE, then onclose, same tick.
    relay.eose();
    relay.closed(relay.reqLog[0].id, 'auth-required: members only');
    const r = await q;
    expect(r.perRelay).toEqual({ [A]: 'closed' });
    expect(r.complete).toBe(false);

    // A real EOSE still settles complete, and the hub's own CLOSE afterwards is not a verdict.
    const q2 = t.hub.query({ relays: [A], filters: [{ kinds: [1] }], maxWaitMs: 2000 });
    await flush();
    relay.eose();
    const r2 = await q2;
    expect(r2.perRelay).toEqual({ [A]: 'eose' });
    expect(r2.complete).toBe(true);
    expect(relay.openSubs()).toHaveLength(0);
  });
});
