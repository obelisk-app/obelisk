import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequestCoalescer } from './coalescer';

interface FakeSub { close: () => void }

const subscribeManyMock = vi.fn();

vi.mock('./pool', () => ({
  verifyDMEvent: () => true,
  getDMPool: () => ({
    subscribeMany: (relays: string[], filters: unknown[], handlers: { onevent: (e: unknown) => void; oneose?: (relay: string) => void }) => {
      subscribeManyMock(relays, filters);
      return { close: () => {} } as FakeSub;
    },
  }),
}));

describe('RequestCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribeManyMock.mockClear();
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
});
