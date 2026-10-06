import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoundedMap, BoundedSet, type EvictReason } from '@/lib/relay-hub/bounded-map';

describe('BoundedMap', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('never exceeds maxEntries under 10,000 inserts, for either policy', () => {
    for (const policy of ['lru', 'fifo'] as const) {
      const m = new BoundedMap<number, number>({ maxEntries: 100, policy });
      for (let i = 0; i < 10_000; i++) m.set(i, i);
      expect(m.size).toBe(100);
      expect(m.has(9999)).toBe(true);
      expect(m.has(0)).toBe(false);
    }
  });

  it('LRU keeps a key that is read; FIFO evicts it regardless', () => {
    const lru = new BoundedMap<number, number>({ maxEntries: 50, policy: 'lru' });
    const fifo = new BoundedMap<number, number>({ maxEntries: 50, policy: 'fifo' });
    for (let i = 0; i < 1000; i++) {
      lru.set(i, i);
      fifo.set(i, i);
      if (i % 25 === 0) {
        lru.get(0);
        fifo.get(0);
      }
    }
    expect(lru.has(0)).toBe(true);
    expect(fifo.has(0)).toBe(false);
  });

  it('holds a byte budget with a caller sizeOf, keeping the newest entry even when it alone exceeds it', () => {
    const m = new BoundedMap<string, string>({ maxEntries: 1000, maxBytes: 100, sizeOf: (v) => v.length });
    for (let i = 0; i < 50; i++) m.set(`k${i}`, 'x'.repeat(30));
    expect(m.bytes).toBeLessThanOrEqual(100);
    expect(m.size).toBe(3);
    m.set('big', 'y'.repeat(500));
    expect(m.size).toBe(1);
    expect(m.get('big')).toHaveLength(500);
  });

  it('expires on read, on sweep, and honours a per-entry TTL override', () => {
    const m = new BoundedMap<string, number>({ maxEntries: 10, ttlMs: 1000 });
    m.set('a', 1);
    m.set('b', 2, { ttlMs: 5000 });
    vi.advanceTimersByTime(1000);
    expect(m.get('a')).toBeUndefined();
    expect(m.get('b')).toBe(2);
    m.set('c', 3);
    vi.advanceTimersByTime(1000);
    expect(m.sweep()).toBe(1);
    expect(m.size).toBe(1);
  });

  it('calls onEvict once per evicted key with the reason', () => {
    const evicted: [string, EvictReason][] = [];
    const m = new BoundedMap<string, number>({ maxEntries: 2, onEvict: (k, _v, r) => evicted.push([k, r]) });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    m.delete('b');
    m.trimTo(0);
    expect(evicted).toEqual([
      ['a', 'capacity'],
      ['b', 'delete'],
      ['c', 'trim'],
    ]);
  });

  it('rejects a zero cap instead of silently caching nothing', () => {
    expect(() => new BoundedMap({ maxEntries: 0 })).toThrow();
  });
});

describe('BoundedSet', () => {
  it('is FIFO and bounded', () => {
    const s = new BoundedSet<number>(3);
    expect(s.add(1)).toBe(true);
    expect(s.add(1)).toBe(false);
    s.add(2);
    s.add(3);
    s.add(4);
    expect(s.size).toBe(3);
    expect(s.has(1)).toBe(false);
    expect(s.has(4)).toBe(true);
  });
});
