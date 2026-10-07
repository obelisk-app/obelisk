import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import {
  BackgroundRelayWatcher,
  backgroundTargets,
  loadRecentRelays,
  touchRecentRelay,
  type WatchStreamCallbacks,
} from '@/services/nostr-bridge/relay/background-watch';
import { BACKGROUND_LOOKBACK_S, BACKGROUND_RETRY_MS, RECENT_RELAY_CAP } from '@/constants/nostr-bridge/relay';

const ME = 'a'.repeat(64);
const A = 'wss://a.example';
const B = 'wss://b.example';
const C = 'wss://c.example';
const D = 'wss://d.example';
const E = 'wss://e.example';

describe('recent relays (MRU)', () => {
  beforeEach(() => localStorage.clear());

  it('moves a relay to the front, dedupes, and caps', () => {
    for (const r of [A, B, C, D, E]) touchRecentRelay(ME, r);
    touchRecentRelay(ME, C);
    const list = loadRecentRelays(ME);
    expect(list[0]).toBe(C);
    expect(list).toHaveLength(RECENT_RELAY_CAP);
    expect(new Set(list).size).toBe(list.length);
    expect(list).not.toContain(A);
  });

  it('is per account', () => {
    touchRecentRelay(ME, A);
    expect(loadRecentRelays('b'.repeat(64))).toEqual([]);
  });

  it('normalizes URLs', () => {
    touchRecentRelay(ME, 'wss://a.example/');
    expect(loadRecentRelays(ME)).toEqual([A]);
  });
});

describe('backgroundTargets', () => {
  it('drops the active relay and relays no longer in the rail, keeps order, caps at 3', () => {
    expect(backgroundTargets([A, B, C, D, E], A, [A, B, C, D, E])).toEqual([B, C, D]);
    expect(backgroundTargets([A, B, C, D], B, [A, C, D])).toEqual([A, C, D]);
    expect(backgroundTargets([A], A, [A])).toEqual([]);
  });
});

/**
 * What the watcher holds on the hub: REQs and leases, each released
 * independently. `order` records the sequence of acquisitions so the test
 * can see that a relay's lease is taken before its first REQ.
 */
class FakeHub {
  subs: Array<{ relay: string; filter: Filter; cb: WatchStreamCallbacks; released: boolean }> = [];
  leases: Array<{ relay: string; released: boolean }> = [];
  order: string[] = [];
  subscribe(relay: string, filter: Filter, cb: WatchStreamCallbacks) {
    const sub = { relay, filter, cb, released: false };
    this.subs.push(sub);
    this.order.push(`req:${relay}`);
    return { release: () => { sub.released = true; } };
  }
  acquireLease(relay: string) {
    const lease = { relay, released: false };
    this.leases.push(lease);
    this.order.push(`lease:${relay}`);
    return { release: () => { lease.released = true; } };
  }
  open() { return this.subs.filter((s) => !s.released); }
  /** Relays with an open `#p` (tagged) stream. */
  tagged() { return this.open().filter((s) => s.filter['#p']); }
  live() { return this.open().filter((s) => !s.filter['#p']); }
  held() { return this.leases.filter((l) => !l.released).map((l) => l.relay); }
}

describe('BackgroundRelayWatcher', () => {
  let hub: FakeHub;
  const events: Array<[string, NostrEvent]> = [];
  const NOW_MS = 1_800_000_000_000;
  const make = (sinceFor = () => 0) => {
    hub = new FakeHub();
    return new BackgroundRelayWatcher({
      subscribe: (relay, filter, cb) => hub.subscribe(relay, filter, cb),
      acquireLease: (relay) => hub.acquireLease(relay),
      onEvent: (relay, ev) => events.push([relay, ev]),
      sinceFor,
      now: () => NOW_MS,
    });
  };

  beforeEach(() => { events.length = 0; });
  afterEach(() => vi.useRealTimers());

  it('opens a #p catch-up stream and a live stream per target, under a watch lease taken before the REQs', () => {
    const w = make();
    w.sync(ME, [A, B]);
    expect(hub.tagged().map((s) => s.relay)).toEqual([A, B]);
    expect(hub.live().map((s) => s.relay)).toEqual([A, B]);
    const tagged = hub.tagged()[0];
    expect(tagged.filter).toMatchObject({ kinds: [9], '#p': [ME] });
    expect(tagged.filter.since).toBe(NOW_MS / 1000 - BACKGROUND_LOOKBACK_S);
    const live = hub.live()[0];
    expect(live.filter.kinds).toEqual([9]);
    expect(live.filter.since).toBeGreaterThan(NOW_MS / 1000 - 60);
    expect(live.filter.limit).toBeUndefined();
    // The lease is what lets the hub answer the relay's challenge; it must
    // exist before the REQ opens the socket, or a whitelist relay CLOSEs
    // the first REQ `auth-required:` on a socket that cannot AUTH yet.
    expect(hub.held()).toEqual([A, B]);
    expect(hub.order).toEqual([`lease:${A}`, `req:${A}`, `req:${A}`, `lease:${B}`, `req:${B}`, `req:${B}`]);
  });

  it('starts from the relay cursor when it is recent', () => {
    const w = make(() => NOW_MS / 1000 - 60);
    w.sync(ME, [A]);
    expect(hub.tagged()[0].filter.since).toBe(NOW_MS / 1000 - 60);
  });

  it('converges: releases dropped targets (REQs and lease), opens new ones, leaves unchanged ones alone', () => {
    const w = make();
    w.sync(ME, [A, B]);
    w.sync(ME, [B, C]);
    expect(hub.tagged().map((s) => s.relay)).toEqual([B, C]);
    expect(hub.live().map((s) => s.relay)).toEqual([B, C]);
    expect(hub.subs.filter((s) => s.relay === A).every((s) => s.released)).toBe(true);
    expect(hub.held()).toEqual([B, C]);
    expect(hub.subs.filter((s) => s.relay === B)).toHaveLength(2);
  });

  it('holds a lease only for watched relays', () => {
    const w = make();
    w.sync(ME, [A]);
    expect(w.isWatched(A)).toBe(true);
    expect(w.isWatched(`${A}/`)).toBe(true);
    expect(w.isWatched(B)).toBe(false);
    expect(hub.held()).toEqual([A]);
  });

  it('forwards events with their relay, and stops forwarding after unwatch', () => {
    const w = make();
    w.sync(ME, [A]);
    const sub = hub.subs[0];
    sub.cb.onEvent({ id: '1' } as NostrEvent);
    w.sync(ME, [B]);
    sub.cb.onEvent({ id: '2' } as NostrEvent);
    expect(events.map(([r, e]) => [r, e.id])).toEqual([[A, '1']]);
  });

  it('stop() releases everything; empty targets stop too', () => {
    const w = make();
    w.sync(ME, [A, B]);
    w.sync(ME, []);
    expect(hub.open()).toHaveLength(0);
    expect(hub.held()).toEqual([]);
    expect(w.watched).toEqual([]);
  });

  it('switching accounts releases the first account\'s watch and opens the new one', () => {
    const w = make();
    w.sync(ME, [A]);
    const first = hub.subs.slice();
    const firstLease = hub.leases[0];
    w.sync('b'.repeat(64), [A]);
    expect(first.every((s) => s.released)).toBe(true);
    expect(firstLease.released).toBe(true);
    expect(hub.held()).toEqual([A]);
    expect(hub.tagged()[0].filter['#p']).toEqual(['b'.repeat(64)]);
  });

  it('reopens a stream the hub gave up on after the backoff, but not after a whitelist rejection', () => {
    vi.useFakeTimers();
    const w = make();
    w.sync(ME, [A, B]);
    const [aTagged, bTagged] = hub.tagged();
    aTagged.cb.onClosed('hub: max attempts');
    bTagged.cb.onClosed('restricted: not on the whitelist');
    vi.advanceTimersByTime(BACKGROUND_RETRY_MS);
    // Only A's tagged stream was reopened (the old handle released first);
    // the live streams were untouched and B stays closed.
    expect(hub.subs).toHaveLength(5);
    expect(aTagged.released).toBe(true);
    expect(hub.subs[4]).toMatchObject({ relay: A });
    expect(hub.subs[4].filter['#p']).toEqual([ME]);
    expect(bTagged.released).toBe(false);
  });

  it('does not reopen streams it released itself', () => {
    vi.useFakeTimers();
    const w = make();
    w.sync(ME, [A]);
    const [tagged, live] = hub.subs;
    w.sync(ME, [B]);
    tagged.cb.onClosed('closed by caller');
    live.cb.onClosed('closed by caller');
    vi.advanceTimersByTime(BACKGROUND_RETRY_MS);
    expect(hub.subs.map((s) => s.relay)).toEqual([A, A, B, B]);
  });
});
