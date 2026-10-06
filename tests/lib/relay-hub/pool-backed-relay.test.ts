/**
 * The pool-backed transport: the hub owns sockets that a `SimplePool`-shaped
 * object opens, AUTH permission stays with the lease table, and a publish
 * reaches the pool one relay at a time through the hub's own publish path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, EventTemplate, Filter, VerifiedEvent } from 'nostr-tools';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { createRelayHub, type RelayHubImpl } from '@/lib/relay-hub/hub';
import { createPoolBackedRelayFactory, type PoolBackedRelayFactory } from '@/lib/relay-hub/pool-backed-relay';
import type { Identity, PoolRelayLike, PoolSubscribeParams, SimplePoolLike, Signer, SubCloser } from '@/lib/relay-hub/types';
import { A, B } from '@/lib/relay-hub/test-support';

interface FakePoolRelay extends PoolRelayLike {
  url: string;
  connected: boolean;
  onclose?: (() => void) | null;
  onauth?: Signer | undefined;
  challenge?: string;
  authCalls: number;
  authPromise: Promise<string> | null;
  auth(sign: Signer): Promise<string>;
}

/** A `SimplePool`-shaped double at the pool level, like the bridge suites use. */
class FakeSimplePool implements SimplePoolLike {
  readonly ensureRelayCalls: string[] = [];
  readonly subscribeCalls: { relays: string[]; filter: Filter; params: PoolSubscribeParams & { onauth?: Signer } }[] = [];
  readonly publishCalls: { relays: string[]; params: { onauth?: Signer } | undefined }[] = [];
  readonly closeCalls: string[][] = [];
  readonly relays = new Map<string, FakePoolRelay>();
  failNext: string | null = null;
  destroyed = false;

  constructor(readonly automaticallyAuth: (url: string) => Signer | null) {}

  relay(url: string): FakePoolRelay {
    let r = this.relays.get(url);
    if (!r) {
      const created: FakePoolRelay = {
        url,
        connected: false,
        onclose: null,
        onauth: undefined,
        challenge: 'c1',
        authCalls: 0,
        authPromise: null,
        auth(sign) {
          if (this.authPromise) return this.authPromise;
          this.authCalls += 1;
          this.authPromise = sign({ kind: 22242, created_at: 1, content: '', tags: [['relay', url], ['challenge', this.challenge ?? '']] }).then(() => 'ok');
          return this.authPromise;
        },
      };
      r = created;
      this.relays.set(url, created);
    }
    return r;
  }

  async ensureRelay(url: string): Promise<PoolRelayLike> {
    this.ensureRelayCalls.push(url);
    if (this.failNext) {
      const reason = this.failNext;
      this.failNext = null;
      throw new Error(reason);
    }
    const r = this.relay(url);
    // nostr-tools installs the pool's automaticallyAuth answer on every ensureRelay.
    const signer = this.automaticallyAuth(url);
    if (signer) r.onauth = signer;
    r.connected = true;
    return r;
  }

  subscribe(relays: string[], filter: Filter, params: PoolSubscribeParams & { onauth?: Signer }): SubCloser {
    this.subscribeCalls.push({ relays, filter, params });
    return { close: () => undefined };
  }

  async querySync(): Promise<NostrEvent[]> {
    return [];
  }

  publish(relays: string[], _event: NostrEvent, params?: { onauth?: Signer }): Promise<string>[] {
    this.publishCalls.push({ relays, params });
    return relays.map(() => Promise.resolve('ok'));
  }

  destroy(): void {
    this.destroyed = true;
  }

  close(relays: string[]): void {
    this.closeCalls.push(relays);
    for (const url of relays) {
      const r = this.relays.get(url);
      if (r) r.connected = false;
      this.relays.delete(url);
    }
  }
}

const sk = generateSecretKey();
const pubkey = getPublicKey(sk);
const signer = vi.fn((template: EventTemplate): Promise<VerifiedEvent> => Promise.resolve(finalizeEvent(template, sk)));
const session: Identity = { id: 'session', pubkey, signer, authPolicy: 'auth-when-challenged' };

function build(): { hub: RelayHubImpl; pools: FakeSimplePool[]; backed: PoolBackedRelayFactory } {
  const pools: FakeSimplePool[] = [];
  const backed = createPoolBackedRelayFactory({
    createPool: (automaticallyAuth) => {
      const pool = new FakeSimplePool(automaticallyAuth);
      pools.push(pool);
      return pool;
    },
  });
  const hub = createRelayHub({
    relayFactory: backed.factory,
    releaseIdentity: backed.releaseIdentity,
    env: { now: () => Date.now(), random: () => 0.5, isOnline: () => true, isHidden: () => false, events: null },
  });
  hub.setIdentity(session);
  return { hub, pools, backed };
}

const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

describe('pool-backed transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signer.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('one pool per identity; its automaticallyAuth answers only for a leased relay, even before that socket exists', async () => {
    const { hub, pools } = build();
    await hub.connect(A);
    expect(pools).toHaveLength(1);
    const pool = pools[0];
    expect(pool.ensureRelayCalls).toEqual([A]);
    // No lease anywhere: the pool is told "no signer" for the open socket and for a relay never seen.
    expect(pool.automaticallyAuth(A)).toBeNull();
    expect(pool.automaticallyAuth(B)).toBeNull();

    const leaseB = hub.acquireAuthLease(B, 'voice');
    // A lease on a relay with no socket yet still answers: the hub tracks the
    // entry without handshaking, so the signer exists before the first frame.
    expect(pool.automaticallyAuth(B)).toBeTypeOf('function');
    expect(hub.status(B).connection).toBe('idle');
    expect(pool.ensureRelayCalls).toEqual([A]);
    leaseB.release();
    expect(pool.automaticallyAuth(B)).toBeNull();

    const leaseA = hub.acquireAuthLease(A, 'active');
    const fn = pool.automaticallyAuth(A);
    expect(fn).toBeTypeOf('function');
    // The pool relay carries the same signer the hub installed, so a relay
    // AUTH frame handled by nostr-tools reaches the hub's memo.
    expect(pool.relay(A).onauth).toBe(fn);
    leaseA.release();
    expect(pool.relay(A).onauth).toBeUndefined();

    const ephemeral: Identity = { id: 'ephemeral:1', pubkey: null, signer: null, authPolicy: 'never-auth' };
    hub.setIdentity(ephemeral);
    await hub.connect(A, { identityId: 'ephemeral:1' });
    expect(pools).toHaveLength(2);
    expect(pools[1].automaticallyAuth(A)).toBeNull();
  });

  it('a drop reported through the pool relay reaches the supervisor, which reconnects on the same pool', async () => {
    const { hub, pools } = build();
    const lease = hub.acquireAuthLease(A, 'active');
    await hub.connect(A);
    const pool = pools[0];
    const relay = pool.relay(A);
    await relay.auth(relay.onauth ?? (() => Promise.reject(new Error('no signer'))));
    await flush();
    expect(signer).toHaveBeenCalledTimes(1);
    expect(hub.status(A)).toMatchObject({ connection: 'connected', socketGeneration: 1, auth: 'authenticated' });

    relay.connected = false;
    relay.onclose?.();
    expect(hub.status(A)).toMatchObject({ connection: 'reconnecting', auth: 'stale' });
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(pool.ensureRelayCalls).toEqual([A, A]);
    expect(pools).toHaveLength(1);
    expect(hub.status(A)).toMatchObject({ connection: 'connected', socketGeneration: 2 });

    // The new generation's challenge is a new signature; the old one is not reused.
    relay.challenge = 'c2';
    relay.authPromise = null;
    await relay.auth(relay.onauth ?? (() => Promise.reject(new Error('no signer'))));
    await flush();
    expect(signer).toHaveBeenCalledTimes(2);
    expect(hub.status(A).promptCount).toBe(2);
    lease.release();
  });

  it('connect() rejects on the attempt it waited for and fires a scheduled retry at once', async () => {
    const { hub, pools } = build();
    await hub.connect(A);
    const pool = pools[0];
    pool.failNext = 'down';
    const relay = pool.relay(A);
    relay.connected = false;
    relay.onclose?.();
    // The supervisor scheduled a retry in 1 s; an explicit connect fires it now.
    const p = hub.connect(A, { timeoutMs: 10_000 });
    await flush();
    await expect(p).rejects.toThrow(/unreachable \(down\)/);
    expect(pool.ensureRelayCalls).toEqual([A, A]);
    // The supervisor keeps going behind the rejected caller: that was its
    // second failed attempt, so the next one is at the 2 s step.
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(pool.ensureRelayCalls).toEqual([A, A, A]);
    expect(hub.status(A).connection).toBe('connected');
  });

  it('dropSocket recycles a held socket and leaves an unheld one idle', async () => {
    const { hub, pools } = build();
    await hub.connect(A);
    const pool = pools[0];
    hub.dropSocket(A);
    await flush();
    expect(pool.closeCalls).toEqual([[A]]);
    expect(pool.ensureRelayCalls).toEqual([A, A]);
    expect(hub.status(A).socketGeneration).toBe(2);

    hub.disconnect(A);
    // A socket opened only for a one-shot query is held by nobody once it settles.
    const query = hub.query({ relays: [B], filters: [{ kinds: [0] }], maxWaitMs: 10, cache: { mode: 'bypass' } });
    await vi.advanceTimersByTimeAsync(20);
    await query;
    expect(hub.status(B).connection).toBe('connected');
    hub.dropSocket(B);
    expect(hub.status(B).connection).toBe('idle');
  });
});

describe('identities on the pool-backed transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a removed identity takes its pool with it; the session pool is untouched', async () => {
    const { hub, pools, backed } = build();
    await hub.connect(A);
    const call: Identity = { id: 'ephemeral:call', pubkey: 'c'.repeat(64), signer: null, authPolicy: 'never-auth' };
    hub.setIdentity(call);
    await hub.connect(A, { identityId: call.id });
    expect(pools).toHaveLength(2);
    expect(backed.hasPool(call.id)).toBe(true);
    // never-auth: its pool is told "no signer", lease or not.
    hub.acquireAuthLease(A, 'voice', call.id);
    expect(pools[1].automaticallyAuth(A)).toBeNull();

    hub.removeIdentity(call.id);
    expect(pools[1].destroyed).toBe(true);
    expect(backed.hasPool(call.id)).toBe(false);
    expect(pools[0].destroyed).toBe(false);
    expect(hub.status(A)).toMatchObject({ connection: 'connected' });
  });
});

describe('publishing on the pool-backed transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signer.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reaches the pool one relay per call, never with a caller signer, and holds the socket only while in flight', async () => {
    const { hub, pools } = build();
    const event = finalizeEvent({ kind: 1, created_at: 1, content: '', tags: [] }, sk);
    const results = hub.publish({ relays: [A, B], event });
    // Held from the moment the publish starts, so the budget cannot evict it.
    expect(hub.sockets.get(A, 'session')?.busy).toBe(1);
    expect(await results).toEqual([
      { url: A, status: 'ok', reason: 'ok' },
      { url: B, status: 'ok', reason: 'ok' },
    ]);
    const pool = pools[0];
    expect(pool.publishCalls.map((c) => c.relays)).toEqual([[A], [B]]);
    // AUTH permission is the socket's lease, never a per-call signer.
    expect(pool.publishCalls.every((c) => c.params === undefined)).toBe(true);
    expect(hub.sockets.get(A, 'session')?.busy).toBe(0);
    expect(hub.sockets.get(B, 'session')?.busy).toBe(0);
  });

  it('never answers AUTH for a publish on a relay without a lease; with one, auth-first signs once and publishes', async () => {
    const { hub, pools } = build();
    const event = finalizeEvent({ kind: 1, created_at: 1, content: '', tags: [] }, sk);
    const unleased = hub.publish({ relays: [A], event, authMode: 'auth-first' });
    await flush();
    expect(await unleased).toEqual([{ url: A, status: 'rejected', reason: 'hub: auth unavailable' }]);
    const pool = pools[0];
    expect(pool.publishCalls).toHaveLength(0);
    expect(pool.relay(A).authCalls).toBe(0);
    expect(signer).not.toHaveBeenCalled();

    const lease = hub.acquireAuthLease(A, 'publish');
    const leased = hub.publish({ relays: [A], event, authMode: 'auth-first' });
    await flush(20);
    expect(await leased).toEqual([{ url: A, status: 'ok', reason: 'ok' }]);
    expect(pool.relay(A).authCalls).toBe(1);
    expect(signer).toHaveBeenCalledTimes(1);
    expect(pool.publishCalls).toHaveLength(1);
    lease.release();
  });
});
