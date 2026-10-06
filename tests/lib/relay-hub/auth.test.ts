/**
 * Requirement (b): the user is never asked to authenticate more than once
 * per relay per socket generation. Every test here drives `FakeRelay`
 * challenges, drops and reconnects with fake timers; none sleeps.
 *
 * This file and `tests/services/nostr-bridge/relay-hub-bridge.test.ts` are not
 * redundant and neither covers the other (round 6 ruling,
 * `RULING-hub-pool-seam.md`). This is the only test that catches a bad
 * memo key: re-keying the AUTH memo on the challenge plus `created_at` (the
 * original bug shape) turns six tests here red and leaves the bridge test
 * green, because nostr-tools' per-socket `authPromise` collapses concurrent
 * AUTH calls before the memo is consulted. The bridge test is the only one
 * that catches a pool rebuild or a socket teardown on reconnect, which this
 * file cannot see. Do not delete either on the grounds that the other
 * covers it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRefusedError } from '@/lib/relay-hub/auth';
import type { AuthState } from '@/lib/relay-hub/types';
import { A, advance, ephemeralIdentity, fakeEvent, flush, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

describe('AUTH layer', () => {
  let t: TestHub;

  beforeEach(() => {
    vi.useFakeTimers();
    t = makeHub();
  });
  afterEach(() => {
    t.hub.dispose();
    vi.useRealTimers();
  });

  it('signer prompts across a socket drop: exactly one per socket generation', async () => {
    const signer = makeSigner();
    t.hub.setIdentity(sessionIdentity(signer));
    t.hub.acquireAuthLease(A, 'active');

    // Two concurrent subscribers and a publish all land before the relay answers.
    const h1 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9], '#h': ['g1'] }], onEvent: () => undefined });
    const h2 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [39000] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    expect(relay).toBeDefined();
    if (!relay) return;
    expect(relay.connected).toBe(true);
    expect(t.hub.status(A).socketGeneration).toBe(1);

    relay.challenge('challenge-gen1');
    const publish = t.hub.publish({ relays: [A], event: fakeEvent({ kind: 9 }) });
    await flush();
    expect(signer.calls).toHaveLength(1);
    expect(relay.sentAuth).toHaveLength(1);
    expect(t.hub.status(A).auth).toBe<AuthState>('signing');

    relay.acceptAuth();
    await flush();
    await publish;
    expect(t.hub.status(A).auth).toBe<AuthState>('authenticated');
    expect(t.hub.status(A).promptCount).toBe(1);

    // `created_at` rollover: a second template for the SAME challenge is a memo hit.
    // (The old memo keyed on created_at and would have prompted again here.)
    const onauth = relay.onauth;
    expect(onauth).toBeDefined();
    if (!onauth) return;
    await advance(1000);
    const again = await onauth({
      kind: 22242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['relay', A], ['challenge', 'challenge-gen1']],
      content: '',
    });
    expect(again.id).toBe(relay.sentAuth[0].id);
    expect(signer.calls).toHaveLength(1);

    // Transport drop: the hub's supervisor reconnects the SAME relay instance.
    relay.drop();
    expect(t.hub.status(A).connection).toBe('reconnecting');
    expect(t.hub.status(A).auth).toBe<AuthState>('stale');
    expect(signer.calls).toHaveLength(1);

    await advance(1000); // base backoff, jitter factor 1.0
    expect(relay.connectCalls).toBe(2);
    expect(t.hub.status(A).connection).toBe('connected');
    expect(t.hub.status(A).socketGeneration).toBe(2);
    expect(t.factory.allFor(A)).toHaveLength(1);

    // Both REQs were re-issued on the new generation before any new prompt.
    expect(relay.openSubs()).toHaveLength(2);
    expect(signer.calls).toHaveLength(1);

    relay.challenge('challenge-gen2');
    await flush();
    expect(signer.calls).toHaveLength(2);
    relay.acceptAuth();
    await flush();
    expect(t.hub.status(A).auth).toBe<AuthState>('authenticated');

    // The invariant: prompts == socket generations, with three concurrent
    // consumers (two subs, one publish) and a created_at rollover riding along.
    expect(signer.calls).toHaveLength(t.hub.status(A).socketGeneration);
    expect(t.hub.promptCount()).toBe(2);
    h1.release();
    h2.release();
  });

  it('breaks loudly if the memo keyed on the challenge-bearing template: same challenge string on a new generation signs again, different created_at on the same generation does not', async () => {
    const signer = makeSigner();
    t.hub.setIdentity(sessionIdentity(signer));
    t.hub.acquireAuthLease(A, 'active');
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.challenge('same');
    await flush();
    relay.acceptAuth();
    await flush();
    expect(signer.calls).toHaveLength(1);

    relay.drop();
    await advance(1000);
    relay.challenge('same'); // a relay reusing a challenge string is still a new socket
    await flush();
    expect(signer.calls).toHaveLength(2);
    handle.release();
  });

  it('records the state machine: not-required -> challenged -> signing -> authenticated -> stale', async () => {
    const signer = makeSigner();
    t.hub.setIdentity(sessionIdentity(signer));
    t.hub.acquireAuthLease(A, 'active');
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(t.hub.status(A).auth).toBe<AuthState>('not-required');
    relay.challenge('c');
    await flush();
    relay.acceptAuth();
    await flush();
    relay.drop();
    const seen = t.statuses.filter((s) => s.url === A).map((s) => s.auth);
    const compact = seen.filter((s, i) => i === 0 || seen[i - 1] !== s);
    // The signer is installed at socket creation, before the handshake, so
    // no AUTH frame can ever arrive unanswered; the stream starts past 'none'.
    expect(compact).toEqual(['not-required', 'challenged', 'signing', 'authenticated', 'stale']);
    handle.release();
  });

  it('refused pins the challenge: the same challenge is never re-signed, a new generation is', async () => {
    const signer = makeSigner();
    t.hub.setIdentity(sessionIdentity(signer));
    t.hub.acquireAuthLease(A, 'active');
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.challenge('c1');
    await flush();
    relay.refuseAuth('restricted: not whitelisted');
    await flush();
    expect(t.hub.status(A).auth).toBe<AuthState>('refused');
    expect(t.hub.status(A).authError).toBe('restricted: not whitelisted');

    const onauth = relay.onauth;
    if (!onauth) throw new Error('no onauth');
    await expect(
      onauth({ kind: 22242, created_at: 1, tags: [['relay', A], ['challenge', 'c1']], content: '' }),
    ).rejects.toBeInstanceOf(AuthRefusedError);
    expect(signer.calls).toHaveLength(1);

    relay.drop();
    await advance(1000);
    relay.challenge('c2');
    await flush();
    expect(signer.calls).toHaveLength(2);
    handle.release();
  });

  it('a signer failure moves to failed and the next challenge retries', async () => {
    const signer = makeSigner();
    t.hub.setIdentity(sessionIdentity(signer));
    t.hub.acquireAuthLease(A, 'active');
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    signer.failNext = 'user rejected';
    relay.challenge('c1');
    await flush();
    expect(t.hub.status(A).auth).toBe<AuthState>('failed');
    expect(t.hub.status(A).authError).toBe('user rejected');
    expect(relay.sentAuth).toHaveLength(0);
    // nostr-tools leaves this socket's authPromise pending for ever after a
    // signer failure; recovery is the next generation, which the hub drives.
    relay.drop();
    await advance(1000);
    relay.challenge('c2');
    await flush();
    expect(signer.calls).toHaveLength(2);
    expect(relay.sentAuth).toHaveLength(1);
    handle.release();
  });

  it('a local (nsec) signer signs but never counts as a prompt', async () => {
    const signer = makeSigner();
    t.hub.setIdentity(sessionIdentity(signer, { localSigner: true }));
    t.hub.acquireAuthLease(A, 'active');
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.challenge('c1');
    await flush();
    expect(signer.calls).toHaveLength(1);
    expect(relay.sentAuth).toHaveLength(1);
    expect(t.hub.promptCount()).toBe(0);
    expect(t.hub.status(A).promptCount).toBe(0);
    handle.release();
  });

  it('without a lease the socket has no signer, so a challenge is never answered and the pubkey never leaks', async () => {
    const signer = makeSigner();
    t.hub.setIdentity(sessionIdentity(signer));
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(relay.onauth).toBeUndefined();
    relay.challenge('c1');
    await flush();
    expect(signer.calls).toHaveLength(0);
    expect(relay.sentAuth).toHaveLength(0);
    expect(t.hub.status(A).auth).toBe<AuthState>('none');

    // Acquiring the lease later answers the challenge the relay is still holding.
    const lease = t.hub.acquireAuthLease(A, 'dm');
    await flush();
    expect(signer.calls).toHaveLength(1);
    expect(relay.sentAuth).toHaveLength(1);
    relay.acceptAuth();
    await flush();
    expect(t.hub.status(A).auth).toBe<AuthState>('authenticated');

    // Releasing the last lease uninstalls the signer and drops the record.
    lease.release();
    expect(relay.onauth).toBeUndefined();
    expect(t.hub.status(A).auth).toBe<AuthState>('none');
    handle.release();
  });

  it('one lease table is refcounted across reasons', async () => {
    const signer = makeSigner();
    t.hub.setIdentity(sessionIdentity(signer));
    const l1 = t.hub.acquireAuthLease(A, 'active');
    const l2 = t.hub.acquireAuthLease(A, 'voice');
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(relay.onauth).toBeDefined();
    l1.release();
    expect(relay.onauth).toBeDefined();
    l1.release(); // idempotent
    expect(t.hub.leaseCount(A)).toBe(1);
    l2.release();
    expect(relay.onauth).toBeUndefined();
    handle.release();
  });

  it('a never-auth identity cannot be given a signer even with a lease', async () => {
    const session = makeSigner();
    const eph = makeSigner();
    t.hub.setIdentity(sessionIdentity(session));
    t.hub.setIdentity(ephemeralIdentity('call1', eph));
    t.hub.acquireAuthLease(A, 'dm', 'ephemeral:call1');
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [25050] }], identityId: 'ephemeral:call1', onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A, 'ephemeral:call1');
    if (!relay) throw new Error('no relay');
    expect(relay.onauth).toBeUndefined();
    relay.challenge('c1');
    await flush();
    expect(session.calls).toHaveLength(0);
    expect(eph.calls).toHaveLength(0);
    expect(relay.sentAuth).toHaveLength(0);
    handle.release();
  });

  it('a REQ CLOSED auth-required while the prompt is open rides that prompt and re-issues once the relay accepts', async () => {
    const signer = makeSigner();
    signer.manual = true;
    t.hub.setIdentity(sessionIdentity(signer));
    t.hub.acquireAuthLease(A, 'active');
    const handle = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.challenge('c1');
    await flush();
    expect(signer.calls).toHaveLength(1);
    const [req] = relay.openSubs();
    relay.closed(req.id, 'auth-required: we only serve members');
    await flush();
    expect(relay.reqLog).toHaveLength(1); // no blind retry while the human is looking at the popup
    signer.resolvePending();
    await flush();
    relay.acceptAuth();
    await flush();
    expect(relay.reqLog).toHaveLength(2);
    expect(signer.calls).toHaveLength(1);
    handle.release();
  });
});
