import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { AuthLease, AuthLeaseReason, QueryResult, SubscribeSpec } from '@/lib/relay-hub';
import { RELAY_SWITCH_GRACE_MS, RequestsModule } from '@/services/nostr-bridge/subscriptions/registry';
import { openWatchedReq, type WatchedReqDeps } from '@/services/nostr-bridge/subscriptions/watched';
import { StateStore } from '@/services/nostr-bridge/common/state-store';

const ACTIVE = 'wss://active.example';
const CALL = 'wss://call.example';

function fakeHub() {
  const specs: SubscribeSpec[] = [];
  const released: SubscribeSpec[] = [];
  const leases: Array<{ url: string; purpose: string; released: boolean }> = [];
  const disconnects: Array<{ url: string; graceMs?: number }> = [];
  return {
    specs,
    released,
    leases,
    disconnects,
    subscribe: vi.fn((spec: SubscribeSpec) => {
      specs.push(spec);
      return { keys: [], shared: false, release: () => released.push(spec), setPriority: vi.fn() };
    }),
    query: vi.fn(async (): Promise<QueryResult> => ({ events: [], complete: true, fromCache: false, perRelay: {} })),
    acquireAuthLease: vi.fn((url: string, purpose: AuthLeaseReason): AuthLease => {
      const lease = { url, purpose: String(purpose), released: false };
      leases.push(lease);
      return { release: () => { lease.released = true; } };
    }),
    disconnect: vi.fn((url: string, opts?: { graceMs?: number }) => { disconnects.push({ url, graceMs: opts?.graceMs }); }),
  };
}

function watchedDeps(hub: ReturnType<typeof fakeHub>, loggedIn = true): WatchedReqDeps & { access: Array<[string, string, unknown]> } {
  const access: Array<[string, string, unknown]> = [];
  return {
    access,
    hub,
    signerOffered: () => loggedIn,
    setRelayAccess: (url, state, opts) => { access.push([url, state, opts]); },
    setRelayAccessDeferred: (url, state) => { access.push([url, `deferred:${state}`, undefined]); },
  };
}

function setup(socketUp = true) {
  const hub = fakeHub();
  const connectionState = new StateStore('Connected');
  let up = socketUp;
  const reqs = new RequestsModule({
    hub,
    relays: () => [ACTIVE],
    watched: watchedDeps(hub),
    connectionState,
    activeSocketUp: () => up,
  });
  return { hub, reqs, connectionState, setUp: (v: boolean) => { up = v; } };
}

const ev = (pubkey = 'a'.repeat(64)): NostrEvent => ({ id: 'e', pubkey, kind: 1, content: '', tags: [], created_at: 1, sig: '' });

describe('openWatchedReq', () => {
  it('reports access from events and EOSE, and fires oneose once every relay has answered', () => {
    const hub = fakeHub();
    const deps = watchedDeps(hub);
    const onEose = vi.fn();
    const onEvent = vi.fn();
    openWatchedReq(deps, [ACTIVE, CALL], { kinds: [1] }, onEvent, onEose);
    const spec = hub.specs[0];
    spec.onEvent(ev(), ACTIVE);
    expect(onEvent).toHaveBeenCalledTimes(1);
    spec.onEose?.(ACTIVE);
    expect(onEose).not.toHaveBeenCalled();
    spec.onEose?.(CALL);
    expect(onEose).toHaveBeenCalledTimes(1);
    expect(deps.access).toEqual([
      [ACTIVE, 'ok', undefined],
      [ACTIVE, 'ok', { fromEose: true }],
      [CALL, 'ok', { fromEose: true }],
    ]);
  });

  it('soaks an auth-required CLOSED, overrides on a whitelist refusal, and hands a quota CLOSED to the caller', () => {
    const hub = fakeHub();
    const deps = watchedDeps(hub, false);
    const onQuota = vi.fn();
    openWatchedReq(deps, [ACTIVE], { kinds: [1] }, vi.fn(), undefined, { onQuotaOrRateLimitClose: onQuota });
    const spec = hub.specs[0];
    spec.onRelayClosed?.(ACTIVE, 'auth-required: sign in');
    expect(deps.access.at(-1)).toEqual([ACTIVE, 'deferred:auth-required', undefined]);
    spec.onRelayClosed?.(ACTIVE, 'rate-limited: slow down');
    expect(onQuota).toHaveBeenCalledTimes(1);
    expect(hub.released).toEqual([spec]);
  });

  it('leaves the banner alone for a per-channel REQ', () => {
    const hub = fakeHub();
    const deps = watchedDeps(hub);
    openWatchedReq(deps, [ACTIVE], { kinds: [9] }, vi.fn(), undefined, { affectsRelayAccess: false });
    hub.specs[0].onEvent(ev(), ACTIVE);
    hub.specs[0].onRelayClosed?.(ACTIVE, 'auth-required: no');
    expect(deps.access).toEqual([]);
  });
});

describe('RequestsModule', () => {
  it('releases every tracked REQ on closeAll and forgets one on closeTracked', () => {
    const { reqs, hub } = setup();
    const a = reqs.subscribeWatched([ACTIVE], { kinds: [1] }, vi.fn());
    const b = reqs.subscribeWatched([ACTIVE], { kinds: [2] }, vi.fn());
    reqs.track(a, b);
    reqs.closeTracked(a);
    expect(hub.released).toHaveLength(1);
    reqs.closeAll();
    expect(hub.released).toHaveLength(2);
    reqs.closeAll();
    expect(hub.released).toHaveLength(2);
  });

  it('waits for the active socket before opening an un-pinned watched REQ', () => {
    const { reqs, hub, connectionState, setUp } = setup(false);
    const stop = reqs.subscribeFilterWatched({ kinds: [1] }, vi.fn());
    expect(hub.specs).toHaveLength(0);
    setUp(true);
    connectionState.set('Disconnected');
    connectionState.set('Connected');
    expect(hub.specs).toHaveLength(1);
    stop();
    expect(hub.released).toHaveLength(1);
  });

  it('keeps a pinned REQ through closeAll, leases the call relay first, and lets its socket go on the grace', () => {
    const { reqs, hub } = setup();
    const stop = reqs.pinned.subscribeVoice({ kinds: [20078] }, vi.fn(), { relays: [CALL], relayMode: 'replace', answerAuth: true });
    expect(hub.leases).toEqual([{ url: CALL, purpose: 'voice', released: false }]);
    expect(hub.acquireAuthLease.mock.invocationCallOrder[0]).toBeLessThan(hub.subscribe.mock.invocationCallOrder[0]);
    expect(hub.specs[0].priority).toBe('voice');
    reqs.closeAll();
    expect(hub.released).toHaveLength(0);
    stop();
    expect(hub.released).toHaveLength(1);
    expect(hub.leases[0].released).toBe(true);
    expect(hub.disconnects).toEqual([{ url: CALL, graceMs: RELAY_SWITCH_GRACE_MS }]);
  });

  it('never lets go of the browsed relay when a pinned REQ on it is released', () => {
    const { reqs, hub } = setup();
    const stop = reqs.subscribeFilterWatched({ kinds: [1] }, vi.fn(), { relays: [ACTIVE], relayMode: 'replace' });
    stop();
    expect(hub.disconnects).toEqual([]);
  });
});
