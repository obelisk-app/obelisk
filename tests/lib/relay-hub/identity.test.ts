/**
 * Multi-identity socket tables (DECISIONS §1). The privacy property is
 * enforced by the socket key, not by code living in another file: an
 * ephemeral `never-auth` identity gets its own socket to the same relay,
 * never answers a challenge with any key, and never rides another
 * identity's socket.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { HubError } from '@/lib/relay-hub/env';
import { A, B, advance, ephemeralIdentity, fakeEvent, flush, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

describe('identities and sockets', () => {
  let t: TestHub;

  beforeEach(() => {
    vi.useFakeTimers();
    t = makeHub();
  });
  afterEach(() => {
    t.hub.dispose();
    vi.useRealTimers();
  });

  it('opens one socket per (relay, identity) under concurrent subscribe calls to the same relay', async () => {
    t.hub.setIdentity(sessionIdentity(makeSigner()));
    const handles = [1, 2, 3, 4, 5].map((i) =>
      t.hub.subscribe({ relays: [A, 'wss://relay-a.example/'], filters: [{ kinds: [9], '#h': [`g${i}`] }], onEvent: () => undefined }),
    );
    const q = t.hub.query({ relays: [A], filters: [{ kinds: [0], authors: ['ab'] }] });
    const p = t.hub.publish({ relays: [A], event: fakeEvent() });
    await flush();
    expect(t.factory.calls.filter((c) => c.url === A)).toHaveLength(1);
    expect(t.factory.allFor(A)).toHaveLength(1);
    expect(t.factory.get(A)?.connectCalls).toBe(1);
    expect(t.hub.statuses()).toHaveLength(1);
    for (const h of handles) h.release();
    await advance(5000);
    await q;
    await p;
  });

  it('an ephemeral never-auth identity never answers a challenge with the session key and never rides the session socket', async () => {
    const session = makeSigner();
    const eph = makeSigner();
    t.hub.setIdentity(sessionIdentity(session));
    t.hub.setIdentity(ephemeralIdentity('call1', eph));
    t.hub.acquireAuthLease(A, 'active'); // the session is allowed to AUTH on A

    const sessionEvents: NostrEvent[] = [];
    const callEvents: NostrEvent[] = [];
    const hs = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: (ev) => sessionEvents.push(ev) });
    const hc = t.hub.subscribe({
      relays: [A],
      filters: [{ kinds: [9] }], // identical filter: must still NOT share the session's REQ
      identityId: 'ephemeral:call1',
      onEvent: (ev) => callEvents.push(ev),
    });
    await flush();

    // Two sockets to one relay, keyed by identity.
    expect(t.factory.calls).toEqual([
      { url: A, identityId: 'session' },
      { url: A, identityId: 'ephemeral:call1' },
    ]);
    const sessionRelay = t.factory.get(A, 'session');
    const callRelay = t.factory.get(A, 'ephemeral:call1');
    if (!sessionRelay || !callRelay) throw new Error('missing sockets');
    expect(sessionRelay).not.toBe(callRelay);
    expect(hs.keys).toEqual(hc.keys); // same canonical key, different socket, different REQ
    expect(sessionRelay.reqLog).toHaveLength(1);
    expect(callRelay.reqLog).toHaveLength(1);

    // The relay challenges both sockets. Only the session answers, with its own key.
    sessionRelay.challenge('c-session');
    callRelay.challenge('c-call');
    await flush();
    expect(session.calls).toHaveLength(1);
    expect(eph.calls).toHaveLength(0);
    expect(callRelay.onauth).toBeUndefined();
    expect(callRelay.sentAuth).toHaveLength(0);
    expect(sessionRelay.sentAuth).toHaveLength(1);
    expect(sessionRelay.sentAuth[0].pubkey).toBe(session.pubkey);
    expect(t.hub.status(A, 'ephemeral:call1').auth).toBe('none');

    // Events on the call socket reach only the call subscriber, and vice versa.
    callRelay.emit(fakeEvent({ kind: 9, content: 'to the call' }));
    sessionRelay.emit(fakeEvent({ kind: 9, content: 'to the session' }));
    expect(callEvents.map((e) => e.content)).toEqual(['to the call']);
    expect(sessionEvents.map((e) => e.content)).toEqual(['to the session']);

    // Ending the call removes its socket and nothing else.
    t.hub.removeIdentity('ephemeral:call1');
    expect(callRelay.closeCalls).toBe(1);
    expect(sessionRelay.closeCalls).toBe(0);
    expect(t.hub.statuses().map((s) => s.identityId)).toEqual(['session']);
    hs.release();
    hc.release();
  });

  it('replacing an identity with a different pubkey closes its sockets and re-issues its REQs on new ones', async () => {
    const x = makeSigner();
    const y = makeSigner();
    t.hub.setIdentity(sessionIdentity(x));
    t.hub.acquireAuthLease(A, 'active');
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.challenge('c1');
    await flush();
    relay.acceptAuth();
    await flush();
    expect(x.calls).toHaveLength(1);

    t.hub.setIdentity(sessionIdentity(y));
    expect(relay.closeCalls).toBe(1); // a socket bound to X is never reused by Y
    await flush();
    expect(relay.connectCalls).toBe(2);
    expect(relay.openSubs()).toHaveLength(1); // the live sub survived the swap
    expect(t.hub.status(A).auth).toBe('not-required');
    relay.challenge('c2');
    await flush();
    expect(y.calls).toHaveLength(1);
    expect(x.calls).toHaveLength(1);
    expect(relay.sentAuth.at(-1)?.pubkey).toBe(y.pubkey);
    handle.release();
  });

  it('removeIdentity closes its subscriptions with a terminal reason and drops its leases', async () => {
    t.hub.setIdentity(sessionIdentity(makeSigner()));
    t.hub.acquireAuthLease(A, 'active');
    const closed: string[] = [];
    const handle = t.hub.subscribe({
      relays: [A, B],
      filters: [{ kinds: [9] }],
      onEvent: () => undefined,
      onClosed: (relay, reason) => closed.push(`${relay} ${reason}`),
    });
    await flush();
    t.hub.removeIdentity('session');
    expect(closed.sort()).toEqual([`${A} identity removed`, `${B} identity removed`]);
    expect(t.hub.statuses()).toHaveLength(0);
    expect(t.hub.leaseCount(A)).toBe(0);
    expect(() => t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined })).toThrow(HubError);
    handle.release();
  });

  it('an unknown identity is a programming error, not a silent fallback to the session key', () => {
    t.hub.setIdentity(sessionIdentity(makeSigner()));
    expect(() =>
      t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], identityId: 'ephemeral:nope', onEvent: () => undefined }),
    ).toThrow(/unknown identity/);
    expect(t.factory.relays).toHaveLength(0);
  });

  it('enforces the socket budget with the documented eviction order and refuses rather than evicting a held socket', async () => {
    t.hub.dispose();
    t = makeHub({ maxSockets: 2 });
    t.hub.setIdentity(sessionIdentity(makeSigner()));
    // A: held by a live sub. B: opened for a query only (unheld once settled).
    const hA = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    const q = t.hub.query({ relays: [B], filters: [{ kinds: [0] }], maxWaitMs: 100 });
    await flush();
    t.factory.get(B)?.eose();
    await q;
    expect(t.hub.statuses().map((s) => s.url).sort()).toEqual([A, B].sort());

    // Room for a third is made by evicting the unheld B, not the held A.
    const hC = t.hub.subscribe({ relays: ['wss://relay-c.example'], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    expect(t.factory.get(B)?.closeCalls).toBe(1);
    expect(t.factory.get(A)?.closeCalls).toBe(0);

    // Both remaining sockets are held: a fourth is refused loudly.
    expect(() => t.hub.subscribe({ relays: ['wss://relay-d.example'], filters: [{ kinds: [9] }], onEvent: () => undefined })).toThrow(
      /socket budget/,
    );
    hA.release();
    hC.release();
  });
});
