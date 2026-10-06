/**
 * The per-REQ record helpers the registry and its scheduler share: ordering,
 * the shed victim, holder merging and the resume filters a re-issue sends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubscribeSpec } from '@/lib/relay-hub/types';
import type { SocketEntry } from '@/lib/relay-hub/sockets';
import {
  SEEN_IDS_PER_SUB,
  adoptHolderSettings,
  byPriority,
  createLiveSub,
  lowestOpen,
  resumeFilters,
  usedSlots,
  type Bucket,
  type Holder,
  type LiveSub,
} from '@/lib/relay-hub/live-sub';
import { A, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

function holder(extra: Partial<SubscribeSpec> = {}, priority: Holder['priority'] = 'background'): Holder {
  return { spec: { relays: [A], filters: [{ kinds: [1] }], onEvent: () => undefined, ...extra }, priority };
}

describe('live-sub helpers', () => {
  let t: TestHub;
  let entry: SocketEntry;

  beforeEach(() => {
    vi.useFakeTimers();
    t = makeHub();
    const identity = sessionIdentity(makeSigner());
    t.hub.setIdentity(identity);
    entry = t.hub.sockets.ensure(A, identity);
  });
  afterEach(() => {
    t.hub.dispose();
    vi.useRealTimers();
  });

  function live(seq: number, priority: LiveSub['priority'], issued: boolean): LiveSub {
    const l = createLiveSub(`k${seq}`, entry, [{ kinds: [1] }], priority, seq);
    if (issued) l.issued = { generation: 1, ref: { sub: null } };
    return l;
  }

  it('creates a pending record with an empty seen set capped at SEEN_IDS_PER_SUB', () => {
    const l = live(1, 'dm', false);
    expect(l.status).toBe('pending');
    expect(l.url).toBe(A);
    expect(l.maxAttempts).toBe(Infinity);
    for (let i = 0; i < SEEN_IDS_PER_SUB + 5; i++) l.seen.add(`id${i}`);
    expect(l.seen.has('id0')).toBe(false);
    expect(l.seen.has(`id${SEEN_IDS_PER_SUB + 4}`)).toBe(true);
  });

  it('orders highest priority first, then oldest first', () => {
    const subs = [live(3, 'background', false), live(2, 'voice', false), live(1, 'background', false)];
    expect(subs.sort(byPriority).map((s) => s.seq)).toEqual([2, 1, 3]);
  });

  it('sheds the lowest priority open sub, newest inside a class, and counts only issued slots', () => {
    const bucket: Bucket = { subs: new Map(), max: 3, penaltyTimer: null };
    for (const l of [live(1, 'background', true), live(2, 'background', true), live(3, 'dm', true), live(4, 'background', false)]) {
      bucket.subs.set(l.key, l);
    }
    expect(lowestOpen(bucket)?.seq).toBe(2);
    expect(usedSlots(bucket)).toBe(3);
    expect(lowestOpen({ subs: new Map(), max: 1, penaltyTimer: null })).toBeNull();
  });

  it('a new holder only shortens the watchdog, raises the attempt cap and raises the priority', () => {
    const l = live(1, 'background', false);
    const first = holder({ watchdogMs: 5000, maxAttempts: 2 }, 'dm');
    l.holders.add(first);
    adoptHolderSettings(l, first);
    expect([l.watchdogMs, l.maxAttempts, l.priority]).toEqual([5000, 2, 'dm']);
    const second = holder({ watchdogMs: 9000, maxAttempts: 1 }, 'background');
    l.holders.add(second);
    adoptHolderSettings(l, second);
    expect([l.watchdogMs, l.maxAttempts, l.priority]).toEqual([5000, 2, 'dm']);
    const third = holder({ watchdogMs: 1000, maxAttempts: 7 }, 'voice');
    l.holders.add(third);
    adoptHolderSettings(l, third);
    expect([l.watchdogMs, l.maxAttempts, l.priority]).toEqual([1000, 7, 'voice']);
  });

  it('advances since past the last event only after a reconnect, and never on a bounded window', () => {
    const l = createLiveSub('k', entry, [{ kinds: [1], since: 10 }, { kinds: [7], until: 50 }], 'dm', 1);
    l.firstGeneration = 1;
    l.lastEventAt = 100;
    expect(resumeFilters(l, 1)).toEqual([{ kinds: [1], since: 10 }, { kinds: [7], until: 50 }]);
    expect(resumeFilters(l, 2)).toEqual([{ kinds: [1], since: 101 }, { kinds: [7], until: 50 }]);
    expect(l.filters[0]).toEqual({ kinds: [1], since: 10 });
  });
});
