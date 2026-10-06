/**
 * Requirement (d), the owner's ruling (DECISIONS §4): 5,000 LRU, trim to
 * 2,000 after five hidden minutes, a negative set with a cooldown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileCache, type VisibilitySource } from '@/lib/relay-hub/profile-cache';

function fakeVisibility(): VisibilitySource & { hidden: boolean; set(hidden: boolean): void } {
  const listeners = new Set<() => void>();
  const v = {
    hidden: false,
    isHidden: () => v.hidden,
    onChange: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    set: (hidden: boolean) => {
      v.hidden = hidden;
      for (const cb of Array.from(listeners)) cb();
    },
  };
  return v;
}

const pk = (i: number) => i.toString(16).padStart(64, '0');

describe('ProfileCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays at 5,000 entries under 20,000 inserts and keeps the ones being read', () => {
    const cache = new ProfileCache<{ name: string }>({ visibility: null });
    const hot = [pk(1), pk(2), pk(3)];
    for (let i = 0; i < 20_000; i++) {
      cache.set(pk(i), { name: `u${i}` });
      if (i % 100 === 0) for (const h of hot) cache.get(h);
    }
    expect(cache.size).toBe(5000);
    for (const h of hot) expect(cache.peek(h)).toBeDefined();
    expect(cache.peek(pk(10_000))).toBeUndefined();
  });

  it('trims to 2,000 after the document has been hidden for 5 minutes, and not before', () => {
    const vis = fakeVisibility();
    const cache = new ProfileCache<number>({ visibility: vis });
    for (let i = 0; i < 5000; i++) cache.set(pk(i), i);
    cache.get(pk(0)); // most recently used: must survive the trim
    vis.set(true);
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(cache.size).toBe(5000);
    vi.advanceTimersByTime(1);
    expect(cache.size).toBe(2000);
    expect(cache.trims).toBe(1);
    expect(cache.peek(pk(0))).toBe(0);
    expect(cache.peek(pk(1))).toBeUndefined();
    cache.dispose();
  });

  it('a tab that becomes visible again before 5 minutes is not trimmed', () => {
    const vis = fakeVisibility();
    const cache = new ProfileCache<number>({ visibility: vis });
    for (let i = 0; i < 3000; i++) cache.set(pk(i), i);
    vis.set(true);
    vi.advanceTimersByTime(4 * 60_000);
    vis.set(false);
    vi.advanceTimersByTime(10 * 60_000);
    expect(cache.size).toBe(3000);
    expect(vi.getTimerCount()).toBe(0);
    cache.dispose();
  });

  it('a negative-cached miss is not refetched within the cooldown, and is after', () => {
    const cache = new ProfileCache<number>({ visibility: null });
    expect(cache.shouldFetch(pk(7))).toBe(true);
    cache.markMissing(pk(7));
    expect(cache.shouldFetch(pk(7))).toBe(false);
    expect(cache.isMissing(pk(7))).toBe(true);
    vi.advanceTimersByTime(30 * 60_000 - 1);
    expect(cache.shouldFetch(pk(7))).toBe(false);
    vi.advanceTimersByTime(1);
    expect(cache.shouldFetch(pk(7))).toBe(true);
    // A late arrival clears the negative mark.
    cache.markMissing(pk(8));
    cache.set(pk(8), 8);
    expect(cache.isMissing(pk(8))).toBe(false);
    expect(cache.shouldFetch(pk(8))).toBe(false);
  });

  it('the negative set is bounded too', () => {
    const cache = new ProfileCache<number>({ visibility: null, negativeMax: 100 });
    for (let i = 0; i < 1000; i++) cache.markMissing(pk(i));
    expect(cache.negativeSize).toBe(100);
  });

  it('the trim follows the visibility source it is given, not the global document', () => {
    const hidden = { value: false };
    const listeners = new Set<() => void>();
    const source = {
      isHidden: () => hidden.value,
      onChange: (cb: () => void) => {
        listeners.add(cb);
        return () => void listeners.delete(cb);
      },
    };
    const cache = new ProfileCache<number>({ visibility: source });
    for (let i = 0; i < 3000; i++) cache.set(pk(i), i);
    hidden.value = true;
    for (const cb of Array.from(listeners)) cb(); // the source's change, not document's
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(cache.size).toBe(3000);
    vi.advanceTimersByTime(1);
    expect(cache.size).toBe(2000);
    expect(cache.trims).toBe(1);
    cache.dispose();
    expect(listeners.size).toBe(0); // dispose unsubscribes
    expect(vi.getTimerCount()).toBe(0);

    // With no source there is no listener and never a trim.
    const blind = new ProfileCache<number>({ visibility: null });
    for (let i = 0; i < 3000; i++) blind.set(pk(i), i);
    vi.advanceTimersByTime(10 * 60_000);
    expect(blind.size).toBe(3000);
    blind.dispose();
  });

  it('a positive entry older than its TTL is fetched again on read', () => {
    const cache = new ProfileCache<number>({ visibility: null, ttlMs: 1000 });
    cache.set(pk(1), 1);
    expect(cache.shouldFetch(pk(1))).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(cache.shouldFetch(pk(1))).toBe(true);
    expect(cache.get(pk(1))).toBe(1); // stale-while-revalidate: still served
  });
});
