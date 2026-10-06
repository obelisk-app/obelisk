import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, advance, fakeEvent, flush, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

describe('publish', () => {
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

  it('reports ok, rejected and timeout per relay; an ephemeral kind without an ack is ok', async () => {
    const ok = t.hub.publish({ relays: [A], event: fakeEvent({ kind: 1 }) });
    await flush();
    expect(await ok).toEqual([{ url: A, status: 'ok', reason: null }]);

    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.autoAck = false;
    const ev = fakeEvent({ kind: 1 });
    const rejected = t.hub.publish({ relays: [A], event: ev });
    await flush();
    relay.rejectPublish(ev.id, 'blocked: no');
    expect(await rejected).toEqual([{ url: A, status: 'rejected', reason: 'blocked: no' }]);

    const slow = t.hub.publish({ relays: [A], event: fakeEvent({ kind: 1 }) });
    await advance(4000);
    expect(await slow).toEqual([{ url: A, status: 'timeout', reason: null }]);

    const beacon = t.hub.publish({ relays: [A], event: fakeEvent({ kind: 20078 }) });
    await advance(750);
    expect((await beacon)[0].status).toBe('ok');
  });

  it('auth-required: waits for the AUTH in flight and republishes once; never mode reports it as is', async () => {
    const signer = makeSigner();
    signer.manual = true;
    t.hub.setIdentity(sessionIdentity(signer));
    t.hub.acquireAuthLease(A, 'active');
    await t.hub.connect(A);
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.autoAck = false;
    relay.challenge('c1');
    await flush();

    const ev = fakeEvent({ kind: 9 });
    const p = t.hub.publish({ relays: [A], event: ev });
    await flush();
    relay.rejectPublish(ev.id, 'auth-required: members only');
    await flush();
    expect(relay.published).toHaveLength(1); // waiting on the prompt, not hammering
    signer.resolvePending();
    await flush();
    relay.acceptAuth();
    await flush();
    expect(relay.published).toHaveLength(2);
    relay.ok(ev.id);
    expect(await p).toEqual([{ url: A, status: 'ok', reason: null }]);
    expect(signer.calls).toHaveLength(1);

    const ev2 = fakeEvent({ kind: 9 });
    const never = t.hub.publish({ relays: [A], event: ev2, authMode: 'never' });
    await flush();
    relay.rejectPublish(ev2.id, 'auth-required: members only');
    expect(await never).toEqual([{ url: A, status: 'rejected', reason: 'auth-required: members only' }]);
  });

  it('auth-first: AUTHs before the one publish, and sends nothing when the relay never challenged', async () => {
    t.hub.acquireAuthLease(A, 'publish');
    await t.hub.connect(A);
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    const quiet = t.hub.publish({ relays: [A], event: fakeEvent({ kind: 20078 }), authMode: 'auth-first' });
    await flush();
    expect(await quiet).toEqual([{ url: A, status: 'rejected', reason: 'hub: auth unavailable' }]);
    expect(relay.published).toHaveLength(0);

    relay.challenge('c1');
    await flush();
    const ev = fakeEvent({ kind: 20078 });
    const authed = t.hub.publish({ relays: [A], event: ev, authMode: 'auth-first' });
    await flush();
    expect(relay.published).toHaveLength(0); // the AUTH goes first
    relay.acceptAuth();
    await flush();
    expect(relay.published).toEqual([ev]);
    expect((await authed)[0].status).toBe('ok');
  });

  it('an unreachable relay is reported without blocking the others', async () => {
    const results = t.hub.publish({ relays: [A, 'not a url'], event: fakeEvent({ kind: 1 }) });
    await flush();
    const [a, bad] = await results;
    expect(a.status).toBe('ok');
    expect(bad.status).toBe('unreachable');
  });

  it('a dead relay reports unreachable at its own ack deadline, and the live relay reports first through onResult', async () => {
    // B never completes its handshake; A answers at once.
    const landed: string[] = [];
    const results = t.hub.publish({
      relays: [A, B, 'wss://relay-b.example/'], // the duplicate of B collapses to one row
      event: fakeEvent({ kind: 1 }),
      onResult: (r) => landed.push(`${r.url}:${r.status}`),
    });
    await flush();
    const rb = t.factory.get(B);
    if (!rb) throw new Error('no relay');
    rb.connectMode = 'manual';
    rb.drop(); // query-free, sub-free: the supervisor leaves it down; publish must give up on its own
    const second = t.hub.publish({ relays: [A, B], event: fakeEvent({ kind: 1 }), onResult: (r) => landed.push(`${r.url}:${r.status}`) });
    await flush();
    expect(await results).toEqual([
      { url: A, status: 'ok', reason: null },
      { url: B, status: 'ok', reason: null },
    ]);
    expect(landed).toContain(`${A}:ok`);
    expect(landed.filter((l) => l.startsWith(B))).toHaveLength(1); // the second publish's B is still pending
    await advance(3999);
    expect(landed.filter((l) => l.startsWith(B))).toHaveLength(1);
    await advance(1);
    const [a2, b2] = await second;
    expect(a2.status).toBe('ok');
    expect(b2.status).toBe('unreachable');
    expect(b2.reason).toMatch(/unreachable/);
    expect(landed.filter((l) => l.startsWith(B))).toEqual([`${B}:ok`, `${B}:unreachable`]);
  });
});
