/**
 * Requirement (c): identical concurrent filters produce one REQ, which
 * closes only when the last subscriber releases; relay verdicts, the
 * per-socket budget and reconnect re-issue order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { SubStatus } from '@/lib/relay-hub/types';
import { A, advance, fakeEvent, flush, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

describe('subscription registry', () => {
  let t: TestHub;

  beforeEach(() => {
    vi.useFakeTimers();
    t = makeHub({ maxSubsPerSocket: 3 });
    t.hub.setIdentity(sessionIdentity(makeSigner()));
    t.hub.acquireAuthLease(A, 'active');
  });
  afterEach(() => {
    t.hub.dispose();
    vi.useRealTimers();
  });

  it('identical concurrent filters share one REQ; the REQ closes only when the last subscriber releases', async () => {
    const got1: NostrEvent[] = [];
    const got2: NostrEvent[] = [];
    const h1 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9, 7], '#h': ['g1'] }], onEvent: (e) => got1.push(e) });
    const h2 = t.hub.subscribe({ relays: [A], filters: [{ '#h': ['g1'], kinds: [7, 9] }], onEvent: (e) => got2.push(e) });
    expect(h1.shared).toBe(false);
    expect(h2.shared).toBe(true);
    expect(h1.keys).toEqual(h2.keys);
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(relay.reqLog).toHaveLength(1);

    const ev = fakeEvent({ kind: 9, tags: [['h', 'g1']] });
    relay.emit(ev);
    expect(got1).toEqual([ev]);
    expect(got2).toEqual([ev]);

    h1.release();
    h1.release(); // idempotent
    expect(relay.openSubs()).toHaveLength(1);
    expect(relay.closeLog).toHaveLength(0);
    h2.release();
    expect(relay.openSubs()).toHaveLength(0);
    expect(relay.closeLog).toHaveLength(1);
    expect(t.hub.status(A).openSubs).toBe(0);
  });

  it('a different limit or time window is a different REQ (never merged, so neither caller over-fetches)', async () => {
    const h1 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9], limit: 50 }], onEvent: () => undefined });
    const h2 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9], limit: 10 }], onEvent: () => undefined });
    const h3 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9], limit: 50, since: 1 }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    expect(relay?.reqLog).toHaveLength(3);
    expect(relay?.reqLog.map((r) => r.filters[0].limit)).toEqual([50, 10, 50]);
    h1.release();
    h2.release();
    h3.release();
  });

  it('release during pending never opens the REQ, and a pending retry timer is cleared on release', async () => {
    const relayBefore = t.factory.get(A);
    expect(relayBefore).toBeUndefined();
    const h = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    h.release(); // socket still handshaking
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(relay.reqLog).toHaveLength(0);

    // A CLOSED with an unknown reason arms a backoff retry; releasing cancels it.
    const h2 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    expect(relay.reqLog).toHaveLength(1);
    relay.closed(relay.reqLog[0].id, 'error: something odd');
    h2.release();
    await advance(60_000);
    expect(relay.reqLog).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restricted: is terminal and reported once through onClosed; transport drops are not reported', async () => {
    const closed: string[] = [];
    const statuses: SubStatus[] = [];
    const h = t.hub.subscribe({
      relays: [A],
      filters: [{ kinds: [9] }],
      onEvent: () => undefined,
      onClosed: (_r, reason) => closed.push(reason),
      onStatus: (s) => statuses.push(s),
    });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.drop();
    expect(closed).toEqual([]);
    expect(statuses.at(-1)).toBe<SubStatus>('pending');
    await advance(1000);
    expect(relay.reqLog).toHaveLength(2);
    relay.closed(relay.reqLog[1].id, 'restricted: not a member');
    expect(closed).toEqual(['restricted: not a member']);
    expect(statuses.at(-1)).toBe<SubStatus>('closed');
    await advance(60_000);
    expect(relay.reqLog).toHaveLength(2);
    h.release();
  });

  it('auth-required: retries immediately once, then with backoff, while the socket can AUTH', async () => {
    const h = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.closed(relay.reqLog[0].id, 'auth-required: members only');
    await flush();
    expect(relay.reqLog).toHaveLength(2); // immediate
    relay.closed(relay.reqLog[1].id, 'auth-required: members only');
    await flush();
    expect(relay.reqLog).toHaveLength(2); // no tight loop
    await advance(2000);
    expect(relay.reqLog).toHaveLength(3); // backoff 2^(attempt-1) s
    h.release();
  });

  it('auth-required: without a lease is terminal (the caller must acquire one), not a retry loop', async () => {
    t.hub.dispose();
    t = makeHub();
    t.hub.setIdentity(sessionIdentity(makeSigner()));
    const closed: string[] = [];
    const h = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined, onClosed: (_r, reason) => closed.push(reason) });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.closed(relay.reqLog[0].id, 'auth-required: members only');
    await advance(60_000);
    expect(relay.reqLog).toHaveLength(1);
    expect(closed).toEqual(['auth-required: members only']);
    h.release();
  });

  it('budget: the lowest priority sub is parked to admit a higher one, and reopens when a slot frees', async () => {
    const statuses = new Map<string, SubStatus[]>();
    const sub = (name: string, priority: 'voice' | 'active' | 'dm' | 'background', kind: number) =>
      t.hub.subscribe({
        relays: [A],
        filters: [{ kinds: [kind] }],
        priority,
        onEvent: () => undefined,
        onStatus: (s) => statuses.set(name, [...(statuses.get(name) ?? []), s]),
      });
    const bg1 = sub('bg1', 'background', 1);
    const bg2 = sub('bg2', 'background', 2);
    const active = sub('active', 'active', 3);
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(relay.openSubs()).toHaveLength(3);
    expect(t.hub.status(A).budget).toEqual({ used: 3, max: 3, parked: 0 });

    const voice = sub('voice', 'voice', 4);
    expect(relay.openSubs()).toHaveLength(3);
    expect(statuses.get('bg2')?.at(-1)).toBe<SubStatus>('parked'); // newest background parks first
    expect(statuses.get('voice')?.at(-1)).toBe<SubStatus>('open');
    expect(t.hub.status(A).budget).toEqual({ used: 3, max: 3, parked: 1 });

    const bg3 = sub('bg3', 'background', 5);
    expect(statuses.get('bg3')?.at(-1)).toBe<SubStatus>('parked'); // nothing lower to park

    voice.release();
    expect(statuses.get('bg2')?.at(-1)).toBe<SubStatus>('open'); // oldest parked reopens first
    expect(statuses.get('bg3')?.at(-1)).toBe<SubStatus>('parked');
    bg1.release();
    expect(statuses.get('bg3')?.at(-1)).toBe<SubStatus>('open');
    bg2.release();
    active.release();
    bg3.release();
  });

  it('a quota CLOSED parks the sub, lowers the budget for 60 s, then restores it and reopens', async () => {
    const h1 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [1] }], onEvent: () => undefined });
    const h2 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [2] }], onEvent: () => undefined });
    const h3 = t.hub.subscribe({ relays: [A], filters: [{ kinds: [3] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.closed(relay.reqLog[2].id, 'error: too many concurrent REQs');
    expect(t.hub.status(A).budget).toEqual({ used: 2, max: 2, parked: 1 });
    await advance(59_000);
    expect(relay.openSubs()).toHaveLength(2);
    await advance(1000);
    expect(t.hub.status(A).budget).toEqual({ used: 3, max: 3, parked: 0 });
    h1.release();
    h2.release();
    h3.release();
  });

  it('reconnect re-issues every live REQ in priority order with since advanced past the last event', async () => {
    const order: string[] = [];
    t.hub.subscribe({ relays: [A], filters: [{ kinds: [9], '#h': ['bg'] }], priority: 'background', onEvent: () => undefined });
    t.hub.subscribe({ relays: [A], filters: [{ kinds: [9], '#h': ['active'] }], priority: 'active', onEvent: () => undefined });
    t.hub.subscribe({ relays: [A], filters: [{ kinds: [9], '#h': ['active'], until: 500 }], priority: 'dm', onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(relay.reqLog).toHaveLength(3);
    relay.emit(fakeEvent({ kind: 9, tags: [['h', 'bg']], created_at: 1000 }));
    relay.emit(fakeEvent({ kind: 9, tags: [['h', 'active']], created_at: 2000 }));

    relay.drop();
    await advance(1000);
    const reissued = relay.reqLog.slice(3);
    for (const r of reissued) order.push(String(r.filters[0]['#h']?.[0]) + (r.filters[0].until ? ':until' : ''));
    expect(order).toEqual(['active', 'active:until', 'bg']); // voice > active > dm > background
    expect(reissued[0].filters[0].since).toBe(2001);
    expect(reissued[1].filters[0].since).toBeUndefined(); // a filter with `until` is a fixed window
    expect(reissued[2].filters[0].since).toBe(1001);
  });

  it('dedupes an event re-delivered across a re-issue on the same relay', async () => {
    const got: NostrEvent[] = [];
    t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: (e) => got.push(e) });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    const ev = fakeEvent({ kind: 9, created_at: 10 });
    relay.emit(ev);
    relay.drop();
    await advance(1000);
    expect(relay.emit(ev)).toBe(0); // alreadyHaveEvent short-circuits like nostr-tools would
    expect(got).toHaveLength(1);
  });

  // ---- what the bridge's `subscribeWatched` supervisor brought (migration step 7) ----

  it('watchdog: a REQ with neither EVENT nor EOSE in watchdogMs is closed and re-issued with backoff; EOSE disarms it', async () => {
    const h = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], watchdogMs: 5000, onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(relay.reqLog).toHaveLength(1);
    expect(relay.reqLog[0]).toBeDefined();
    expect(relay.subs.get(relay.reqLog[0].id)?.params.eoseTimeout).toBe(6000); // nostr-tools' synthetic EOSE stays behind the watchdog

    await advance(4999);
    expect(relay.reqLog).toHaveLength(1);
    await advance(1);
    expect(relay.closeLog).toEqual([relay.reqLog[0].id]); // the silent REQ is closed...
    expect(relay.reqLog).toHaveLength(1);
    await advance(1000); // ...and re-issued after the first backoff step
    expect(relay.reqLog).toHaveLength(2);
    await advance(5000);
    await advance(2000); // second step is 2 s
    expect(relay.reqLog).toHaveLength(3);

    relay.eose(relay.reqLog[2].id); // an empty relay still proves the REQ is live
    await advance(60_000);
    expect(relay.reqLog).toHaveLength(3);
    h.release();
  });

  it('watchdog waits while the socket\'s AUTH prompt is in flight, then re-issues if the REQ is still silent', async () => {
    const signer = makeSigner();
    signer.manual = true;
    t.hub.dispose();
    t = makeHub();
    t.hub.setIdentity(sessionIdentity(signer));
    t.hub.acquireAuthLease(A, 'active');
    const h = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], watchdogMs: 1000, onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.challenge('c1'); // a human is now staring at the signer prompt
    await flush();
    expect(t.hub.status(A).auth).toBe('signing');
    await advance(10_000);
    expect(relay.reqLog).toHaveLength(1); // not killed while signing
    signer.resolvePending();
    await flush();
    relay.acceptAuth();
    await flush();
    expect(t.hub.status(A).auth).toBe('authenticated');
    await advance(1000); // the watchdog's next tick finds the REQ still silent
    await advance(1000); // backoff
    expect(relay.reqLog).toHaveLength(2);
    h.release();
  });

  it('maxAttempts: past the cap the sub is terminated with a hub reason, and a later identical subscribe starts fresh', async () => {
    const closed: string[] = [];
    const h = t.hub.subscribe({
      relays: [A],
      filters: [{ kinds: [0], limit: 1 }],
      watchdogMs: 1500,
      maxAttempts: 1,
      onEvent: () => undefined,
      onClosed: (_r, reason) => closed.push(reason),
    });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    await advance(1500);
    expect(closed).toEqual(['hub: gave up after 1 attempt']);
    await advance(60_000);
    expect(relay.reqLog).toHaveLength(1); // no retry at all
    h.release();

    const again = t.hub.subscribe({ relays: [A], filters: [{ kinds: [0], limit: 1 }], onEvent: () => undefined });
    await flush();
    expect(again.shared).toBe(false);
    expect(relay.reqLog).toHaveLength(2); // a new REQ, not the dead one
    again.release();
  });

  it('onRelayClosed reports every CLOSED before the retry decision; a holder that releases there takes the REQ out of the hub\'s hands', async () => {
    const verdicts: string[] = [];
    const terminal: string[] = [];
    const h = t.hub.subscribe({
      relays: [A],
      filters: [{ kinds: [9] }],
      onEvent: () => undefined,
      onRelayClosed: (_r, reason) => verdicts.push(reason),
      onClosed: (_r, reason) => terminal.push(reason),
    });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    relay.closed(relay.reqLog[0].id, 'auth-required: members only');
    await flush();
    expect(verdicts).toEqual(['auth-required: members only']); // seen although the hub retried it
    expect(terminal).toEqual([]);
    expect(relay.reqLog).toHaveLength(2);
    relay.closed(relay.reqLog[1].id, 'restricted: not a member');
    expect(verdicts).toEqual(['auth-required: members only', 'restricted: not a member']);
    expect(terminal).toEqual(['restricted: not a member']); // the terminal one is reported through both
    h.release();

    // A quota CLOSED would park the sub and shed another; a holder that
    // lets go inside the verdict callback keeps the hub out of it.
    const budgetBefore = t.hub.status(A).budget;
    const quota = t.hub.subscribe({
      relays: [A],
      filters: [{ kinds: [7] }],
      onEvent: () => undefined,
      onRelayClosed: () => quota.release(),
    });
    await flush();
    relay.closed(relay.reqLog[2].id, 'restricted: Subscription quota exceeded: 50/50');
    expect(t.hub.status(A).budget).toEqual({ ...budgetBefore, used: 0, parked: 0 });
    expect(t.hub.status(A).openSubs).toBe(0);
  });

  it('nostr-tools\' attempted-and-failed AUTH wrapper is an AUTH race (immediate retry, then backoff); around restricted: it is terminal', async () => {
    const closed: string[] = [];
    const h = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9] }], onEvent: () => undefined, onClosed: (_r, reason) => closed.push(reason) });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    const timedOut = 'auth was required and attempted, but failed with: Error: auth timed out';
    relay.closed(relay.reqLog[0].id, timedOut);
    await flush();
    expect(relay.reqLog).toHaveLength(2); // immediate, once
    relay.closed(relay.reqLog[1].id, timedOut);
    await flush();
    expect(relay.reqLog).toHaveLength(2);
    await advance(2000);
    expect(relay.reqLog).toHaveLength(3); // backoff, not the 3-strikes path for unknown reasons
    relay.closed(relay.reqLog[2].id, 'auth was required and attempted, but failed with: restricted: blocked');
    expect(closed).toEqual(['auth was required and attempted, but failed with: restricted: blocked']);
    await advance(60_000);
    expect(relay.reqLog).toHaveLength(3);
    h.release();
  });

  it('setPriority moves a REQ to the front of the reconnect re-issue order', async () => {
    const bg = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9], '#h': ['first'] }], onEvent: () => undefined });
    const later = t.hub.subscribe({ relays: [A], filters: [{ kinds: [9], '#h': ['second'] }], onEvent: () => undefined });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    later.setPriority('active'); // the channel the user just opened
    relay.drop();
    await advance(1000);
    const order = relay.reqLog.slice(2).map((r) => r.filters[0]['#h']?.[0]);
    expect(order).toEqual(['second', 'first']);
    later.setPriority('background');
    bg.setPriority('active');
    relay.drop();
    await advance(2000);
    expect(relay.reqLog.slice(4).map((r) => r.filters[0]['#h']?.[0])).toEqual(['first', 'second']);
    bg.release();
    later.release();
  });
});
