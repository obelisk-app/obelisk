/**
 * Design §4.4: the one merge the hub performs keeps every caller's `limit`
 * (the SDK's `QueryBatcher` drops it) and hands each caller only its own
 * authors back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Filter } from 'nostr-tools';
import { planAuthorBatches, queryAuthorsBatched } from '@/lib/relay-hub/batch';
import { A, fakeEvent, flush, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

const pk = (i: number) => i.toString(16).padStart(64, '0');

describe('planAuthorBatches', () => {
  it('merges two single-author kind-0 lookups into one filter whose limit is the sum, not nothing', () => {
    const plan = planAuthorBatches([
      { kinds: [0], authors: [pk(1)], limit: 5 },
      { kinds: [0], authors: [pk(2)], limit: 5 },
    ]);
    expect(plan.filters).toEqual<Filter[]>([{ kinds: [0], authors: [pk(1), pk(2)], limit: 10 }]);
    expect(plan.placement).toEqual([0, 0]);
    expect(plan.merged).toBe(2);
  });

  it('splits a chunk so the merged limit never exceeds 500: 60 callers x limit 10 is two filters', () => {
    const plan = planAuthorBatches(Array.from({ length: 60 }, (_, i) => ({ kinds: [0], authors: [pk(i)], limit: 10 })));
    expect(plan.filters).toHaveLength(2);
    expect(plan.filters.map((f) => f.limit)).toEqual([500, 100]);
    expect(plan.filters.map((f) => f.authors?.length)).toEqual([50, 10]);
    for (const f of plan.filters) expect(f.limit).toBeLessThanOrEqual(500);
  });

  it('chunks the author union at 100, deduplicating and lowercasing authors', () => {
    const inputs: Filter[] = Array.from({ length: 150 }, (_, i) => ({ kinds: [0], authors: [pk(i)] }));
    inputs.push({ kinds: [0], authors: [pk(3).toUpperCase(), pk(3)] }); // a duplicate of author 3 costs nothing
    const plan = planAuthorBatches(inputs);
    expect(plan.filters.map((f) => f.authors?.length)).toEqual([100, 50]);
    expect(plan.filters.every((f) => f.limit === undefined)).toBe(true);
    expect(plan.placement[150]).toBe(0);
  });

  it('never lets a caller without a limit erase another caller’s limit: unbounded candidates merge among themselves', () => {
    const plan = planAuthorBatches([
      { kinds: [0], authors: [pk(1)], limit: 5 },
      { kinds: [0], authors: [pk(2)] },
      { kinds: [0], authors: [pk(3)] },
    ]);
    expect(plan.filters).toEqual<Filter[]>([
      { kinds: [0], authors: [pk(1)], limit: 5 },
      { kinds: [0], authors: [pk(2), pk(3)] },
    ]);
  });

  it('passes a filter with a time window, a search, ids or a tag through verbatim, and keeps different kinds apart', () => {
    const windowed: Filter = { kinds: [0], authors: [pk(1)], since: 100 };
    const tagged: Filter = { kinds: [0], authors: [pk(2)], '#t': ['x'] };
    const plan = planAuthorBatches([
      { kinds: [0], authors: [pk(3)], limit: 1 },
      windowed,
      { kinds: [3], authors: [pk(3)], limit: 1 },
      tagged,
      { kinds: [0], authors: [pk(4)], limit: 1 },
    ]);
    expect(plan.filters).toEqual<Filter[]>([
      { kinds: [0], authors: [pk(3), pk(4)], limit: 2 },
      { kinds: [3], authors: [pk(3)], limit: 1 },
      windowed,
      tagged,
    ]);
    expect(plan.placement).toEqual([0, 2, 1, 3, 0]);
    expect(plan.merged).toBe(2);
  });

  it('leaves a single oversized caller alone rather than silently shrinking it', () => {
    const big: Filter = { kinds: [0], authors: Array.from({ length: 120 }, (_, i) => pk(i)), limit: 10 };
    const plan = planAuthorBatches([big, { kinds: [0], authors: [pk(500)], limit: 1 }]);
    expect(plan.filters).toEqual<Filter[]>([{ kinds: [0], authors: [pk(500)], limit: 1 }, big]);
  });
});

describe('queryAuthorsBatched', () => {
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

  it('issues one REQ with the merged filter and hands each caller only its own author’s events', async () => {
    const filters: Filter[] = [
      { kinds: [0], authors: [pk(1)], limit: 5 },
      { kinds: [0], authors: [pk(2)], limit: 5 },
    ];
    const p = queryAuthorsBatched(t.hub, { relays: [A], filters });
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no relay');
    expect(relay.reqLog).toHaveLength(1);
    expect(relay.reqLog[0].filters).toEqual([{ kinds: [0], authors: [pk(1), pk(2)], limit: 10 }]);
    const a1 = fakeEvent({ kind: 0, pubkey: pk(1), created_at: 10 });
    const a2 = fakeEvent({ kind: 0, pubkey: pk(1), created_at: 11 });
    const b1 = fakeEvent({ kind: 0, pubkey: pk(2), created_at: 12 });
    relay.emit(a1);
    relay.emit(b1);
    relay.emit(a2);
    relay.eose();
    const out = await p;
    expect(out.result.complete).toBe(true);
    expect(out.perFilter[0]).toEqual([a1, a2]);
    expect(out.perFilter[1]).toEqual([b1]);
    expect(out.plan.merged).toBe(2);

    // The same batch again is a cache hit on the merged key: no second REQ.
    const again = await queryAuthorsBatched(t.hub, { relays: [A], filters });
    expect(again.result.fromCache).toBe(true);
    expect(relay.reqLog).toHaveLength(1);
  });
});
