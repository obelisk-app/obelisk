import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequestCoalescer } from './coalescer';

interface FakeSub { close: ReturnType<typeof vi.fn> }

const subscribeManyMock = vi.fn();
const lastSubs: FakeSub[] = [];
const lastHandlers: Array<{ onevent: (e: unknown) => void; oneose?: (relay: string) => void }> = [];

vi.mock('./pool', () => ({
  verifyDMEvent: () => true,
  getDMPool: () => ({
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

  it('merges enqueues within the debounce window into a single REQ per relay set', () => {
    const c = new RequestCoalescer({ debounceMs: 50 });
    c.enqueue({ filters: [{ kinds: [0], authors: ['a'] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    c.enqueue({ filters: [{ kinds: [0], authors: ['b'] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    c.enqueue({ filters: [{ kinds: [3], authors: ['a'] }], relays: ['wss://r1'], onEvent: () => {}, onEose: () => {} });
    expect(subscribeManyMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(subscribeManyMock).toHaveBeenCalledTimes(1);
    const [, filters] = subscribeManyMock.mock.calls[0];
    expect((filters as unknown[]).length).toBe(3);
  });

  it('a separate enqueue after the window opens a new REQ', () => {
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
});
