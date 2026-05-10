// src/lib/dm/relay-list-cache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRelays, _resetRelayCache } from './relay-list-cache';

const enqueueMock = vi.fn();
vi.mock('@nostr-wot/data', async () => {
  const actual = await vi.importActual<typeof import('@nostr-wot/data')>('@nostr-wot/data');
  return {
    ...actual,
    sharedCoalescer: {
      enqueue: (req: any) => { enqueueMock(req); return () => {}; },
      querySync: vi.fn(),
    },
  };
});

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  enqueueMock.mockClear();
  _resetRelayCache();
});

describe('relay-list-cache', () => {
  it('first call enqueues kind-10002 and kind-10050 filters', () => {
    getRelays(me, partner);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const filters = enqueueMock.mock.calls[0][0].filters;
    const kinds = (filters as any[]).flatMap((f) => f.kinds);
    expect(kinds).toContain(10002);
    expect(kinds).toContain(10050);
  });

  it('second call within 6h does not re-enqueue', () => {
    getRelays(me, partner);
    // Seed the cache by simulating a relay event arrival.
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
    onEvent({
      id: 'e1', kind: 10002, pubkey: partner,
      created_at: Math.floor(Date.now() / 1000),
      content: '', tags: [['r', 'wss://x']], sig: 'x',
    } as any);
    enqueueMock.mockClear();
    getRelays(me, partner);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('does not notify when refresh returns identical content', async () => {
    const sub = vi.fn();
    const { dispose } = getRelays(me, partner, { onUpdate: sub });
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
    const ev = { id: 'e1', kind: 10002, pubkey: partner, created_at: 1000, content: '', tags: [['r', 'wss://x']], sig: 'x' } as any;
    onEvent(ev);
    onEvent(ev); // same created_at + content
    expect(sub).toHaveBeenCalledTimes(1);
    dispose?.();
  });

  it('parses kind 10002 r-tags into readRelays/writeRelays', () => {
    getRelays(me, partner);
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
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
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
    onEvent({
      id: 'e2', kind: 10050, pubkey: partner, created_at: 2000, content: '',
      tags: [['relay', 'wss://inbox.one'], ['relay', 'wss://inbox.two']],
      sig: 'x',
    } as any);
    const { result } = getRelays(me, partner);
    expect(result.inbox).toEqual(expect.arrayContaining(['wss://inbox.one', 'wss://inbox.two']));
  });
});
