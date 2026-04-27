// src/lib/dm/relay-list-cache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRelays, _resetRelayCache } from './relay-list-cache';

const enqueueMock = vi.fn();
vi.mock('@/lib/nostr-coalescer', () => ({
  sharedCoalescer: {
    enqueue: (req: any) => { enqueueMock(req); return () => {}; },
    querySync: vi.fn(),
  },
}));

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  enqueueMock.mockClear();
  _resetRelayCache();
});

// Helper: pull the onEvent handler for a specific kind out of the mock,
// since the new design issues one subscribeReplaceable per kind (one
// enqueue per filter).
function onEventFor(kind: number): (e: unknown) => void {
  for (const call of enqueueMock.mock.calls) {
    const req = call[0];
    if ((req.filters as Array<{ kinds: number[] }>).some((f) => f.kinds?.includes(kind))) {
      return req.onEvent;
    }
  }
  throw new Error(`no enqueue for kind ${kind}`);
}

describe('relay-list-cache', () => {
  it('first call enqueues both kind-10002 and kind-10050 (one filter each)', () => {
    getRelays(me, partner);
    // Two enqueues: one per kind. The coalescer collapses them into a
    // single REQ at the wire level when fired in the same window.
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    const allKinds = enqueueMock.mock.calls
      .flatMap((c) => c[0].filters as Array<{ kinds: number[] }>)
      .flatMap((f) => f.kinds);
    expect(allKinds).toContain(10002);
    expect(allKinds).toContain(10050);
  });

  it('does not notify when refresh returns identical content', () => {
    const sub = vi.fn();
    const { dispose } = getRelays(me, partner, { onUpdate: sub });
    const onEvent = onEventFor(10002);
    const ev = { id: 'e1', kind: 10002, pubkey: partner, created_at: 1000, content: '', tags: [['r', 'wss://x']], sig: 'x' } as any;
    onEvent(ev);
    onEvent(ev); // same created_at — older-or-equal, dropped silently
    expect(sub).toHaveBeenCalledTimes(1);
    dispose?.();
  });

  it('parses kind 10002 r-tags into readRelays/writeRelays', () => {
    getRelays(me, partner);
    const onEvent = onEventFor(10002);
    onEvent({
      id: 'e1', kind: 10002, pubkey: partner, created_at: 1000, content: '',
      tags: [['r', 'wss://read.only', 'read'], ['r', 'wss://write.only', 'write'], ['r', 'wss://both']],
      sig: 'x',
    } as any);
    const { result } = getRelays(me, partner);
    expect(result.readRelays).toEqual(expect.arrayContaining(['wss://read.only', 'wss://both']));
    expect(result.writeRelays).toEqual(expect.arrayContaining(['wss://write.only', 'wss://both']));
  });

  it('parses kind 10050 relay tags into inbox', () => {
    getRelays(me, partner);
    const onEvent = onEventFor(10050);
    onEvent({
      id: 'e2', kind: 10050, pubkey: partner, created_at: 2000, content: '',
      tags: [['relay', 'wss://inbox.one'], ['relay', 'wss://inbox.two']],
      sig: 'x',
    } as any);
    const { result } = getRelays(me, partner);
    expect(result.inbox).toEqual(expect.arrayContaining(['wss://inbox.one', 'wss://inbox.two']));
  });
});
