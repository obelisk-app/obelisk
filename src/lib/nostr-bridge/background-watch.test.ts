import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import {
  BACKGROUND_LOOKBACK_S,
  BACKGROUND_RETRY_MS,
  BackgroundRelayWatcher,
  RECENT_RELAY_CAP,
  backgroundTargets,
  loadRecentRelays,
  touchRecentRelay,
  type WatchPool,
} from './background-watch';

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

class FakePool implements WatchPool {
  subs: Array<{ relay: string; filter: Filter; onevent?: (ev: NostrEvent) => void; onclose?: (r: string[]) => void; onauth?: unknown; closed: boolean }> = [];
  closedRelays: string[] = [];
  destroyed = false;
  subscribe(relays: string[], filter: Filter, params: { onevent?: (ev: NostrEvent) => void; onclose?: (r: string[]) => void; onauth?: unknown }) {
    const sub = { relay: relays[0], filter, onevent: params.onevent, onclose: params.onclose, onauth: params.onauth, closed: false };
    this.subs.push(sub);
    return { close: () => { sub.closed = true; } };
  }
  close(relays: string[]) { this.closedRelays.push(...relays); }
  destroy() { this.destroyed = true; }
  open() { return this.subs.filter((s) => !s.closed); }
  /** Relays with an open `#p` (tagged) stream. */
  tagged() { return this.open().filter((s) => s.filter['#p']); }
  live() { return this.open().filter((s) => !s.filter['#p']); }
}

describe('BackgroundRelayWatcher', () => {
  let pool: FakePool;
  let isWatchedFn: ((url: string) => boolean) | null;
  const events: Array<[string, NostrEvent]> = [];
  const NOW_MS = 1_800_000_000_000;
  const signAuth = vi.fn();
  const make = (sinceFor = () => 0) => new BackgroundRelayWatcher({
    signAuth: signAuth as never,
    createPool: (isWatched) => { isWatchedFn = isWatched; pool = new FakePool(); return pool; },
    onEvent: (relay, ev) => events.push([relay, ev]),
    sinceFor,
    now: () => NOW_MS,
  });

  beforeEach(() => { events.length = 0; isWatchedFn = null; });
  afterEach(() => vi.useRealTimers());

  it('opens a #p catch-up stream and a live stream per target, both with onauth', () => {
    const w = make();
    w.sync(ME, [A, B]);
    expect(pool.tagged().map((s) => s.relay)).toEqual([A, B]);
    expect(pool.live().map((s) => s.relay)).toEqual([A, B]);
    const tagged = pool.tagged()[0];
    expect(tagged.filter).toMatchObject({ kinds: [9], '#p': [ME] });
    expect(tagged.filter.since).toBe(NOW_MS / 1000 - BACKGROUND_LOOKBACK_S);
    const live = pool.live()[0];
    expect(live.filter.kinds).toEqual([9]);
    expect(live.filter.since).toBeGreaterThan(NOW_MS / 1000 - 60);
    expect(live.filter.limit).toBeUndefined();
    // Without onauth nostr-tools never re-issues a REQ CLOSED with
    // `auth-required:` — which is how every whitelist relay answers the
    // first REQ on a fresh socket.
    for (const sub of pool.subs) expect(sub.onauth).toBe(signAuth);
  });

  it('starts from the relay cursor when it is recent', () => {
    const w = make(() => NOW_MS / 1000 - 60);
    w.sync(ME, [A]);
    expect(pool.tagged()[0].filter.since).toBe(NOW_MS / 1000 - 60);
  });

  it('converges: closes dropped targets, opens new ones, leaves unchanged ones alone', () => {
    const w = make();
    w.sync(ME, [A, B]);
    w.sync(ME, [B, C]);
    expect(pool.tagged().map((s) => s.relay)).toEqual([B, C]);
    expect(pool.live().map((s) => s.relay)).toEqual([B, C]);
    expect(pool.closedRelays).toEqual([A]);
    expect(pool.subs.filter((s) => s.relay === B)).toHaveLength(2);
  });

  it('answers AUTH only for watched relays', () => {
    const w = make();
    w.sync(ME, [A]);
    expect(isWatchedFn!(A)).toBe(true);
    expect(isWatchedFn!(`${A}/`)).toBe(true);
    expect(isWatchedFn!(B)).toBe(false);
  });

  it('forwards events with their relay, and stops forwarding after unwatch', () => {
    const w = make();
    w.sync(ME, [A]);
    const sub = pool.subs[0];
    sub.onevent!({ id: '1' } as NostrEvent);
    w.sync(ME, [B]);
    sub.onevent!({ id: '2' } as NostrEvent);
    expect(events.map(([r, e]) => [r, e.id])).toEqual([[A, '1']]);
  });

  it('stop() tears everything down; empty targets stop too', () => {
    const w = make();
    w.sync(ME, [A, B]);
    const p = pool;
    w.sync(ME, []);
    expect(p.open()).toHaveLength(0);
    expect(p.destroyed).toBe(true);
    expect(w.watched).toEqual([]);
  });

  it('switching accounts rebuilds the pool', () => {
    const w = make();
    w.sync(ME, [A]);
    const first = pool;
    w.sync('b'.repeat(64), [A]);
    expect(first.destroyed).toBe(true);
    expect(pool).not.toBe(first);
    expect(pool.tagged()[0].filter['#p']).toEqual(['b'.repeat(64)]);
  });

  it('retries a stream that closed on its own, but not after a whitelist rejection', () => {
    vi.useFakeTimers();
    const w = make();
    w.sync(ME, [A, B]);
    const [aTagged, bTagged] = pool.tagged();
    aTagged.onclose!(['connection failed']);
    bTagged.onclose!(['restricted: not on the whitelist']);
    vi.advanceTimersByTime(BACKGROUND_RETRY_MS);
    // Only A's tagged stream was reopened; the live streams were untouched.
    expect(pool.subs).toHaveLength(5);
    expect(pool.subs[4]).toMatchObject({ relay: A });
    expect(pool.subs[4].filter['#p']).toEqual([ME]);
  });

  it('does not retry subs it closed itself', () => {
    vi.useFakeTimers();
    const w = make();
    w.sync(ME, [A]);
    const [tagged, live] = pool.subs;
    w.sync(ME, [B]);
    tagged.onclose!(['closed by caller']);
    live.onclose!(['closed by caller']);
    vi.advanceTimersByTime(BACKGROUND_RETRY_MS);
    expect(pool.subs.map((s) => s.relay)).toEqual([A, A, B, B]);
  });
});
