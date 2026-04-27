import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools/pure';

const enqueueMock = vi.fn();
let enqueueOnEvent: ((e: NostrEvent) => void) | null = null;
const enqueueClose = vi.fn();

vi.mock('@/lib/nostr-coalescer', () => ({
  sharedCoalescer: {
    enqueue: (req: { filters: unknown; relays: unknown; onEvent: (e: NostrEvent) => void }) => {
      enqueueMock(req);
      enqueueOnEvent = req.onEvent;
      return enqueueClose;
    },
  },
}));

import { subscribeReplaceable, subscribeStream } from './nostr-resource';

beforeEach(() => {
  enqueueMock.mockClear();
  enqueueClose.mockClear();
  enqueueOnEvent = null;
});

function makeEvent(over: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'e1', pubkey: 'p1', kind: 0, created_at: 1, content: '', tags: [], sig: 's',
    ...over,
  } as NostrEvent;
}

interface ProfileEntry { event: NostrEvent; name: string }

describe('subscribeReplaceable', () => {
  it('fires onCache synchronously with the hydrated value', () => {
    const onCache = vi.fn();
    const cached: ProfileEntry = { event: makeEvent({ created_at: 100 }), name: 'Alice' };
    subscribeReplaceable<ProfileEntry>({
      filters: [{ kinds: [0], authors: ['p1'] }],
      relays: ['wss://r1'],
      hydrate: () => cached,
      persist: vi.fn(),
      parse: (e) => ({ event: e, name: 'fresh' }),
      onCache,
    });
    expect(onCache).toHaveBeenCalledTimes(1);
    expect(onCache).toHaveBeenCalledWith(cached);
  });

  it('does not fire onCache when nothing cached', () => {
    const onCache = vi.fn();
    subscribeReplaceable<ProfileEntry>({
      filters: [{ kinds: [0] }], relays: ['wss://r1'],
      hydrate: () => null, persist: vi.fn(),
      parse: (e) => ({ event: e, name: '' }),
      onCache,
    });
    expect(onCache).not.toHaveBeenCalled();
  });

  it('persists + fires onUpdate only when a strictly-newer event arrives', () => {
    const persist = vi.fn();
    const onUpdate = vi.fn();
    const cached: ProfileEntry = { event: makeEvent({ created_at: 100 }), name: 'old' };
    subscribeReplaceable<ProfileEntry>({
      filters: [{ kinds: [0] }], relays: ['wss://r1'],
      hydrate: () => cached,
      persist, parse: (e) => ({ event: e, name: 'new' }),
      onUpdate,
    });

    // Older event — ignored.
    enqueueOnEvent?.(makeEvent({ created_at: 50 }));
    expect(persist).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();

    // Same-age event — also ignored (>= comparison).
    enqueueOnEvent?.(makeEvent({ created_at: 100 }));
    expect(persist).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();

    // Newer event — persisted + notified.
    const newer = makeEvent({ created_at: 200 });
    enqueueOnEvent?.(newer);
    expect(persist).toHaveBeenCalledWith({ event: newer, name: 'new' });
    expect(onUpdate).toHaveBeenCalledWith({ event: newer, name: 'new' });
  });

  it('match() filters events before dedup', () => {
    const persist = vi.fn();
    const onUpdate = vi.fn();
    subscribeReplaceable<ProfileEntry>({
      filters: [{ kinds: [0] }], relays: ['wss://r1'],
      hydrate: () => null, persist,
      parse: (e) => ({ event: e, name: 'x' }),
      match: (e) => e.pubkey === 'p1',
      onUpdate,
    });
    enqueueOnEvent?.(makeEvent({ pubkey: 'OTHER', created_at: 200 }));
    expect(persist).not.toHaveBeenCalled();
    enqueueOnEvent?.(makeEvent({ pubkey: 'p1', created_at: 200 }));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('teardown closes the underlying subscription', () => {
    const dispose = subscribeReplaceable<ProfileEntry>({
      filters: [{ kinds: [0] }], relays: ['wss://r1'],
      hydrate: () => null, persist: vi.fn(),
      parse: (e) => ({ event: e, name: '' }),
    });
    dispose();
    expect(enqueueClose).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeStream', () => {
  it('replays cached events via onCache then dedups them out of the stream', () => {
    const onCache = vi.fn();
    const onNew = vi.fn();
    const persist = vi.fn();
    const cached = [makeEvent({ id: 'a' }), makeEvent({ id: 'b' })];
    subscribeStream({
      filters: [{ kinds: [4] }], relays: ['wss://r1'],
      hydrate: () => cached, persist,
      onCache, onNew,
    });
    expect(onCache).toHaveBeenCalledTimes(2);
    expect(onCache).toHaveBeenNthCalledWith(1, cached[0]);
    expect(onCache).toHaveBeenNthCalledWith(2, cached[1]);

    // Same id from relay — already seen via cache, no callback.
    enqueueOnEvent?.(makeEvent({ id: 'a' }));
    expect(persist).not.toHaveBeenCalled();
    expect(onNew).not.toHaveBeenCalled();

    // New id — persist + onNew fire.
    const fresh = makeEvent({ id: 'c' });
    enqueueOnEvent?.(fresh);
    expect(persist).toHaveBeenCalledWith(fresh);
    expect(onNew).toHaveBeenCalledWith(fresh);

    // Same fresh id again — dedup.
    enqueueOnEvent?.(makeEvent({ id: 'c' }));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('accept() can drop incoming events silently', () => {
    const persist = vi.fn();
    const onNew = vi.fn();
    subscribeStream({
      filters: [{ kinds: [4] }], relays: ['wss://r1'],
      hydrate: () => [],
      persist,
      accept: (e) => e.kind === 4,
      onNew,
    });
    enqueueOnEvent?.(makeEvent({ id: 'x', kind: 1 }));
    expect(persist).not.toHaveBeenCalled();
    expect(onNew).not.toHaveBeenCalled();
    enqueueOnEvent?.(makeEvent({ id: 'y', kind: 4 }));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('teardown closes the underlying subscription', () => {
    const dispose = subscribeStream({
      filters: [{ kinds: [4] }], relays: ['wss://r1'],
      hydrate: () => [], persist: vi.fn(),
    });
    dispose();
    expect(enqueueClose).toHaveBeenCalledTimes(1);
  });
});
