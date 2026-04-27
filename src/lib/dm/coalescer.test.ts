import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequestCoalescer } from './coalescer';

interface FakeSub { close: ReturnType<typeof vi.fn> }

const subscribeManyMock = vi.fn();
const lastSubs: FakeSub[] = [];
const lastHandlers: Array<{ onevent: (e: unknown) => void; oneose?: (relay: string) => void }> = [];

// The coalescer now imports `verifyNostrEvent`/`getNostrPool` from
// `@/lib/nostr-pool`. Mock that path so the test can drive the underlying
// SimplePool from `subscribeMany` callbacks.
vi.mock('@/lib/nostr-pool', () => ({
  verifyNostrEvent: () => true,
  getNostrPool: () => ({
    subscribeMany: (relays: string[], filters: unknown[], handlers: { onevent: (e: unknown) => void; oneose?: (relay: string) => void }) => {
      subscribeManyMock(relays, filters);
      const sub: FakeSub = { close: vi.fn() };
      lastSubs.push(sub);
      lastHandlers.push(handlers);
      return sub;
    },
  }),
}));

describe('RequestCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribeManyMock.mockClear();
    lastSubs.length = 0;
    lastHandlers.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges enqueues within the debounce window — one subscribeMany per filter, all sharing the relay set', () => {
    // SimplePool.subscribeMany takes a SINGLE filter object (the "Many" is
    // about relays, not filters). To put multiple filters in one REQ per
    // relay we issue N subscribeMany calls in the same flush; the pool
    // groups same-relay calls into one REQ internally.
    const c = new RequestCoalescer({ debounceMs: 50 });
    c.enqueue({ filters: [{ kinds: [0], authors: ['a'] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    c.enqueue({ filters: [{ kinds: [0], authors: ['b'] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    c.enqueue({ filters: [{ kinds: [3], authors: ['a'] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    expect(subscribeManyMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(subscribeManyMock).toHaveBeenCalledTimes(3);
    // Each call passes one filter object, not an array.
    for (const call of subscribeManyMock.mock.calls) {
      const [, filter] = call;
      expect(Array.isArray(filter)).toBe(false);
      expect(typeof filter).toBe('object');
    }
  });

  it('a separate enqueue after the window opens new subscribeMany calls', () => {
    const c = new RequestCoalescer({ debounceMs: 50 });
    c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    vi.advanceTimersByTime(60);
    c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    vi.advanceTimersByTime(60);
    expect(subscribeManyMock).toHaveBeenCalledTimes(2);
  });

  it('groups by distinct relay set', () => {
    const c = new RequestCoalescer({ debounceMs: 50 });
    c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r2'], onEvent: () => {}, onEose: () => {} });
    vi.advanceTimersByTime(60);
    expect(subscribeManyMock).toHaveBeenCalledTimes(2);
  });

  describe('teardown', () => {
    it('closer called before flush removes the entry; if last in group, no REQ fires', () => {
      const c = new RequestCoalescer({ debounceMs: 50 });
      const close = c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent: () => {} });
      close();
      vi.advanceTimersByTime(60);
      expect(subscribeManyMock).not.toHaveBeenCalled();
    });

    it('closer called after flush stops events from reaching the consumer', () => {
      const c = new RequestCoalescer({ debounceMs: 50 });
      const onEvent = vi.fn();
      const close = c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent });
      vi.advanceTimersByTime(60);
      // First event is delivered.
      lastHandlers[0].onevent({ id: 'a', sig: 'x', pubkey: 'p', kind: 0, content: '', tags: [], created_at: 1 });
      expect(onEvent).toHaveBeenCalledTimes(1);
      close();
      // After close, further events should NOT reach the consumer.
      lastHandlers[0].onevent({ id: 'b', sig: 'x', pubkey: 'p', kind: 0, content: '', tags: [], created_at: 2 });
      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    it('closing the last active entry calls sub.close() on the underlying SimplePool sub', () => {
      const c = new RequestCoalescer({ debounceMs: 50 });
      const close1 = c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent: () => {} });
      const close2 = c.enqueue({ filters: [{ kinds: [3] }], relays: ['wss://r1'], onEvent: () => {} });
      vi.advanceTimersByTime(60);
      const sub = lastSubs[0];
      close1();
      expect(sub.close).not.toHaveBeenCalled(); // still one entry left
      close2();
      expect(sub.close).toHaveBeenCalledTimes(1);
    });

    it('closer is idempotent', () => {
      const c = new RequestCoalescer({ debounceMs: 50 });
      const close = c.enqueue({ filters: [{ kinds: [0] }], relays: ['wss://r1'], onEvent: () => {} });
      vi.advanceTimersByTime(60);
      const sub = lastSubs[0];
      close();
      close();
      expect(sub.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('querySync (Promise-shaped)', () => {
    it('coalesces with concurrent enqueues sharing the same relay-set', async () => {
      const c = new RequestCoalescer({ debounceMs: 50 });
      const onEvent = vi.fn();
      // 1) Live consumer enqueues first.
      c.enqueue({ filters: [{ kinds: [4] }], relays: ['wss://r1'], onEvent });
      // 2) One-shot Promise consumer enqueues within the same window.
      const promise = c.querySync([{ kinds: [0], authors: ['x'] }], { relays: ['wss://r1'], timeoutMs: 1000 });
      // Window flush.
      await vi.advanceTimersByTimeAsync(60);
      // Two subscribeMany calls (one per filter) — same relay set, so the
      // pool groups them into a single REQ at the wire level.
      expect(subscribeManyMock).toHaveBeenCalledTimes(2);
      for (const call of subscribeManyMock.mock.calls) {
        expect(Array.isArray(call[1])).toBe(false);
      }
      // Drive an event + EOSE through one of the handlers — both share the
      // same fan-out closure.
      lastHandlers[0].onevent({ id: 'e1', sig: 's', pubkey: 'p', kind: 0, content: '', tags: [], created_at: 1 });
      lastHandlers[0].oneose?.('wss://r1');
      lastHandlers[1].oneose?.('wss://r1');
      const events = await promise;
      expect(events.map((e) => e.id)).toEqual(['e1']);
      // The live enqueue's onEvent ALSO received the same event — that's the
      // observer fan-out we want.
      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    it('resolves with whatever events arrived by the timeout if EOSE never fires', async () => {
      const c = new RequestCoalescer({ debounceMs: 50 });
      const promise = c.querySync([{ kinds: [0] }], { relays: ['wss://r1'], timeoutMs: 200 });
      await vi.advanceTimersByTimeAsync(60);
      lastHandlers[0].onevent({ id: 'a', sig: 's', pubkey: 'p', kind: 0, content: '', tags: [], created_at: 1 });
      // No EOSE — let the timeout fire.
      await vi.advanceTimersByTimeAsync(250);
      const events = await promise;
      expect(events.map((e) => e.id)).toEqual(['a']);
    });
  });
});
