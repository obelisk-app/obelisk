/**
 * Tests for the Nostr-relay transport layer of voice channels.
 *
 * The bridge (`@/lib/nostr-bridge/client`) is mocked with a thin in-memory
 * implementation that captures `publishEvent` calls and replays them to
 * matching subscribers. This lets us drive presence + signal flows without
 * spinning up a real relay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KIND_VOICE_PRESENCE, KIND_VOICE_SIGNAL } from '@/lib/nip-kinds';

interface FakeEvent {
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  id?: string;
  sig?: string;
}

interface SubFilter { kinds?: number[]; '#e'?: string[]; '#p'?: string[]; since?: number }

const bridgeFake = vi.hoisted(() => {
  const subs: { filter: SubFilter; sink: (ev: FakeEvent) => void }[] = [];
  let nextEventCreatedAt = Math.floor(Date.now() / 1000);
  let selfPubkey = 'self-pk';

  function matches(filter: SubFilter, ev: FakeEvent): boolean {
    if (filter.kinds && !filter.kinds.includes(ev.kind)) return false;
    if (filter['#e']) {
      const eTags = ev.tags.filter((t) => t[0] === 'e').map((t) => t[1]);
      if (!filter['#e'].some((c) => eTags.includes(c))) return false;
    }
    if (filter['#p']) {
      const pTags = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
      if (!filter['#p'].some((p) => pTags.includes(p))) return false;
    }
    return true;
  }

  const impl = {
    getPublicKey: () => selfPubkey,
    publishEvent: vi.fn(async (input: { kind: number; content: string; tags: string[][] }) => {
      const createdAt = nextEventCreatedAt++;
      const ev: FakeEvent = {
        pubkey: selfPubkey,
        kind: input.kind,
        content: input.content,
        tags: input.tags,
        created_at: createdAt,
        id: `fake-id-${createdAt}`,
      };
      // Synchronous fan-out — simpler to test than queueMicrotask.
      for (const s of subs) if (matches(s.filter, ev)) s.sink(ev);
    }),
    subscribeFilter: vi.fn((filter: SubFilter, sink: (ev: FakeEvent) => void) => {
      const sub = { filter, sink };
      subs.push(sub);
      return () => { const i = subs.indexOf(sub); if (i >= 0) subs.splice(i, 1); };
    }),
    // Same signature; in production this version wraps the sub with a
    // 5-second EVENT/EOSE watchdog and exponential-backoff retry.
    subscribeFilterWatched: vi.fn((filter: SubFilter, sink: (ev: FakeEvent) => void) => {
      const sub = { filter, sink };
      subs.push(sub);
      return () => { const i = subs.indexOf(sub); if (i >= 0) subs.splice(i, 1); };
    }),
  };

  return {
    impl,
    inject: (ev: FakeEvent) => {
      for (const s of subs) if (matches(s.filter, ev)) s.sink(ev);
    },
    setSelf: (pk: string) => { selfPubkey = pk; },
    advanceClock: (s: number) => { nextEventCreatedAt += s; },
    setClock: (t: number) => { nextEventCreatedAt = t; },
    reset: () => {
      subs.length = 0;
      nextEventCreatedAt = Math.floor(Date.now() / 1000);
      selfPubkey = 'self-pk';
      impl.publishEvent.mockClear();
      impl.subscribeFilter.mockClear();
      impl.subscribeFilterWatched.mockClear();
    },
  };
});

vi.mock('@/lib/nostr-bridge/client', () => ({
  getBridge: vi.fn(async () => bridgeFake.impl),
  getBridgeImpl: vi.fn(() => bridgeFake.impl),
}));

import {
  publishPresenceBeacon,
  subscribeRoster,
  sendSignal,
  subscribeSignals,
  getSelfPubkey,
  createVoiceTransport,
} from './transport';

beforeEach(() => {
  bridgeFake.reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('publishPresenceBeacon', () => {
  it('publishes a kind 20078 with channel tag and expiration', async () => {
    bridgeFake.setClock(1_000_000);
    await publishPresenceBeacon('ch1');
    expect(bridgeFake.impl.publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: KIND_VOICE_PRESENCE,
        tags: expect.arrayContaining([
          ['e', 'ch1'],
          ['t', 'obelisk-voice-presence'],
        ]),
      }),
    );
    const call = bridgeFake.impl.publishEvent.mock.calls[0][0] as { tags: string[][] };
    const exp = call.tags.find((t) => t[0] === 'expiration');
    expect(exp).toBeDefined();
    expect(parseInt(exp![1], 10)).toBeGreaterThan(0);
  });
});

describe('pinned relay voice transport', () => {
  it('publishes beacons to the origin relay only', async () => {
    const transport = createVoiceTransport({ relayUrl: 'wss://origin.example' });
    await transport.publishPresenceBeacon('ch1');
    expect(bridgeFake.impl.publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: KIND_VOICE_PRESENCE }),
      { extraRelays: ['wss://origin.example'], mode: 'replace' },
    );
  });

  it('pins roster and signal subscriptions to the origin relay', async () => {
    const transport = createVoiceTransport({ relayUrl: 'wss://origin.example' });
    const unsubRoster = await transport.subscribeRoster('ch1', () => {});
    const unsubSignals = await transport.subscribeSignals('ch1', 'me', () => {});

    expect(bridgeFake.impl.subscribeFilterWatched).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kinds: [KIND_VOICE_PRESENCE], '#e': ['ch1'] }),
      expect.any(Function),
      expect.objectContaining({
        relays: ['wss://origin.example'],
        relayMode: 'replace',
        affectsRelayAccess: false,
      }),
    );
    expect(bridgeFake.impl.subscribeFilterWatched).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kinds: [KIND_VOICE_SIGNAL], '#e': ['ch1'] }),
      expect.any(Function),
      expect.objectContaining({
        relays: ['wss://origin.example'],
        relayMode: 'replace',
        affectsRelayAccess: false,
      }),
    );

    unsubRoster();
    unsubSignals();
  });

  it('publishes signals to the origin relay only', async () => {
    const transport = createVoiceTransport({ relayUrl: 'wss://origin.example' });
    await transport.sendSignal('ch1', 'recipient-pk', { type: 'bye', sessionId: 's1', seq: 1 });
    expect(bridgeFake.impl.publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: KIND_VOICE_SIGNAL }),
      { extraRelays: ['wss://origin.example'], mode: 'replace' },
    );
  });
});

describe('voice subs use the watched variant for relay-drop recovery', () => {
  it('subscribeRoster goes through subscribeFilterWatched, not the raw subscribeFilter', async () => {
    // The raw `subscribeFilter` runs once and dies silently when the relay's
    // WebSocket drops mid-call (network blip, server restart). The watched
    // variant has a 5s no-EVENT/EOSE watchdog with exponential-backoff retry,
    // so beacons resume flowing after the WS comes back. Regression guard
    // against the bug where one browser logs "WebSocket already in
    // CLOSING/CLOSED" while another never sees a new joiner.
    const unsub = await subscribeRoster('ch1', () => {});
    expect(bridgeFake.impl.subscribeFilterWatched).toHaveBeenCalled();
    expect(bridgeFake.impl.subscribeFilter).not.toHaveBeenCalled();
    unsub();
  });

  it('subscribeSignals goes through subscribeFilterWatched', async () => {
    const unsub = await subscribeSignals('ch1', 'me', () => {});
    expect(bridgeFake.impl.subscribeFilterWatched).toHaveBeenCalled();
    expect(bridgeFake.impl.subscribeFilter).not.toHaveBeenCalled();
    unsub();
  });
});

describe('subscribeRoster', () => {
  it('emits live roster on each beacon', async () => {
    const events: ReturnType<Parameters<typeof subscribeRoster>[1]> extends void ? unknown[] : never[] = [];
    let lastRoster: { pubkey: string }[] = [];
    const unsub = await subscribeRoster('ch1', (r) => { lastRoster = r; events.push(r); });

    bridgeFake.inject({
      pubkey: 'p1', kind: KIND_VOICE_PRESENCE, content: '',
      tags: [['e', 'ch1'], ['expiration', String(Math.floor(Date.now() / 1000) + 30)]],
      created_at: Math.floor(Date.now() / 1000),
    });

    expect(lastRoster.map((p) => p.pubkey)).toEqual(['p1']);
    unsub();
  });

  it('drops expired beacons', async () => {
    let lastRoster: { pubkey: string }[] = [];
    const unsub = await subscribeRoster('ch1', (r) => { lastRoster = r; });

    const now = Math.floor(Date.now() / 1000);
    bridgeFake.inject({
      pubkey: 'p1', kind: KIND_VOICE_PRESENCE, content: '',
      tags: [['e', 'ch1'], ['expiration', String(now - 1)]],
      created_at: now - 60,
    });

    expect(lastRoster).toEqual([]);
    unsub();
  });

  it('keeps only the newest beacon per pubkey', async () => {
    let lastRoster: { pubkey: string; createdAt: number }[] = [];
    const unsub = await subscribeRoster('ch1', (r) => { lastRoster = r; });
    const now = Math.floor(Date.now() / 1000);

    bridgeFake.inject({ pubkey: 'p1', kind: KIND_VOICE_PRESENCE, content: '',
      tags: [['e', 'ch1'], ['expiration', String(now + 30)]], created_at: now - 5 });
    bridgeFake.inject({ pubkey: 'p1', kind: KIND_VOICE_PRESENCE, content: '',
      tags: [['e', 'ch1'], ['expiration', String(now + 30)]], created_at: now });

    expect(lastRoster).toHaveLength(1);
    expect(lastRoster[0].createdAt).toBe(now);
    unsub();
  });

  it('ignores out-of-order older beacons', async () => {
    let lastRoster: { pubkey: string; createdAt: number }[] = [];
    const unsub = await subscribeRoster('ch1', (r) => { lastRoster = r; });
    const now = Math.floor(Date.now() / 1000);

    bridgeFake.inject({ pubkey: 'p1', kind: KIND_VOICE_PRESENCE, content: '',
      tags: [['e', 'ch1'], ['expiration', String(now + 30)]], created_at: now });
    bridgeFake.inject({ pubkey: 'p1', kind: KIND_VOICE_PRESENCE, content: '',
      tags: [['e', 'ch1'], ['expiration', String(now + 30)]], created_at: now - 10 });

    expect(lastRoster[0].createdAt).toBe(now); // newer wins
    unsub();
  });
});

describe('signal addressing', () => {
  it('sendSignal publishes a kind 25050 directed to the recipient', async () => {
    await sendSignal('ch1', 'recipient-pk', { type: 'offer', sdp: 'v=0', sessionId: 's1', seq: 1 });
    expect(bridgeFake.impl.publishEvent).toHaveBeenCalled();
    const call = bridgeFake.impl.publishEvent.mock.calls[0][0] as { kind: number; tags: string[][]; content: string };
    expect(call.kind).toBe(KIND_VOICE_SIGNAL);
    expect(call.tags).toEqual(expect.arrayContaining([
      ['p', 'recipient-pk'],
      ['e', 'ch1'],
    ]));
    expect(JSON.parse(call.content)).toMatchObject({ type: 'offer', sdp: 'v=0' });
  });

  it('subscribeSignals filters by p-tag and ignores self-published events', async () => {
    bridgeFake.setSelf('me');
    const got: { from: string; payload: { type: string } }[] = [];
    const unsub = await subscribeSignals('ch1', 'me', (from, p) => { got.push({ from, payload: p as { type: string } }); });

    // Event addressed to us — should pass.
    bridgeFake.inject({
      pubkey: 'peer1', kind: KIND_VOICE_SIGNAL,
      content: JSON.stringify({ type: 'offer', sdp: 'v=0', sessionId: 's', seq: 1 }),
      tags: [['e', 'ch1'], ['p', 'me']],
      created_at: Math.floor(Date.now() / 1000),
    });
    // Event addressed to someone else — should be dropped.
    bridgeFake.inject({
      pubkey: 'peer1', kind: KIND_VOICE_SIGNAL,
      content: JSON.stringify({ type: 'offer', sdp: 'v=0', sessionId: 's', seq: 2 }),
      tags: [['e', 'ch1'], ['p', 'someone-else']],
      created_at: Math.floor(Date.now() / 1000),
    });
    // Self-published — should be dropped.
    bridgeFake.inject({
      pubkey: 'me', kind: KIND_VOICE_SIGNAL,
      content: JSON.stringify({ type: 'offer', sdp: 'v=0', sessionId: 's', seq: 3 }),
      tags: [['e', 'ch1'], ['p', 'me']],
      created_at: Math.floor(Date.now() / 1000),
    });

    expect(got).toHaveLength(1);
    expect(got[0].from).toBe('peer1');
    unsub();
  });

  it('subscribeSignals tolerates malformed JSON', async () => {
    const got: unknown[] = [];
    const unsub = await subscribeSignals('ch1', 'me', (_from, p) => { got.push(p); });
    bridgeFake.inject({
      pubkey: 'peer1', kind: KIND_VOICE_SIGNAL,
      content: '{not-valid-json',
      tags: [['e', 'ch1'], ['p', 'me']],
      created_at: Math.floor(Date.now() / 1000),
    });
    expect(got).toHaveLength(0);
    unsub();
  });

  it('subscribeSignals drops duplicate relay deliveries with the same event id', async () => {
    const got: unknown[] = [];
    const unsub = await subscribeSignals('ch1', 'me', (_from, p) => { got.push(p); });
    const ev = {
      id: 'same-event-id',
      pubkey: 'peer1',
      kind: KIND_VOICE_SIGNAL,
      content: JSON.stringify({ type: 'ice', candidates: [{ candidate: 'fake', sdpMid: '0' }], sessionId: 's', seq: 1 }),
      tags: [['e', 'ch1'], ['p', 'me']],
      created_at: Math.floor(Date.now() / 1000),
    };
    bridgeFake.inject(ev);
    bridgeFake.inject(ev);
    expect(got).toHaveLength(1);
    unsub();
  });
});

describe('getSelfPubkey', () => {
  it('returns the bridge identity', () => {
    bridgeFake.setSelf('hex-self');
    expect(getSelfPubkey()).toBe('hex-self');
  });
});
