/**
 * Transitive-discovery tests for the voice transport.
 *
 * Even when a peer's own presence beacon is dropped by every relay we
 * subscribe to, we should still discover them — provided some OTHER peer
 * in the channel mentions them in their beacon's `p` tags. That's what
 * makes the mesh converge on flaky relays.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KIND_VOICE_PRESENCE } from '@/lib/nip-kinds';

interface FakeEvent {
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

interface SubFilter { kinds?: number[]; '#e'?: string[]; '#p'?: string[]; since?: number }

const bridgeFake = vi.hoisted(() => {
  const subs: { filter: SubFilter; sink: (ev: FakeEvent) => void }[] = [];
  let selfPubkey = 'self-pk';

  function matches(filter: SubFilter, ev: FakeEvent): boolean {
    if (filter.kinds && !filter.kinds.includes(ev.kind)) return false;
    if (filter['#e']) {
      const eTags = ev.tags.filter((t) => t[0] === 'e').map((t) => t[1]);
      if (!filter['#e'].some((c) => eTags.includes(c))) return false;
    }
    return true;
  }

  const impl = {
    getPublicKey: () => selfPubkey,
    publishEvent: vi.fn(async (_input: { kind: number; content: string; tags: string[][] }) => {}),
    subscribeFilter: vi.fn((filter: SubFilter, sink: (ev: FakeEvent) => void) => {
      const sub = { filter, sink };
      subs.push(sub);
      return () => { const i = subs.indexOf(sub); if (i >= 0) subs.splice(i, 1); };
    }),
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
    reset: () => {
      subs.length = 0;
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
  transitiveParticipants,
} from './transport';
import type { VoicePresence } from './types';

beforeEach(() => {
  bridgeFake.reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('publishPresenceBeacon with connectedTo', () => {
  it('emits one p-tag per connected pubkey', async () => {
    await publishPresenceBeacon('ch1', ['peerA', 'peerB']);
    const call = bridgeFake.impl.publishEvent.mock.calls[0][0] as { tags: string[][] };
    const pTags = call.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
    expect(pTags.sort()).toEqual(['peerA', 'peerB']);
  });

  it('dedups repeated pubkeys', async () => {
    await publishPresenceBeacon('ch1', ['peerA', 'peerA', 'peerB']);
    const call = bridgeFake.impl.publishEvent.mock.calls[0][0] as { tags: string[][] };
    const pTags = call.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
    expect(pTags.sort()).toEqual(['peerA', 'peerB']);
  });

  it('omits p-tags entirely when there are no connections', async () => {
    await publishPresenceBeacon('ch1');
    const call = bridgeFake.impl.publishEvent.mock.calls[0][0] as { tags: string[][] };
    const pTags = call.tags.filter((t) => t[0] === 'p');
    expect(pTags).toEqual([]);
  });
});

describe('subscribeRoster captures connectedTo', () => {
  it('exposes the publisher\'s p-tag list as connectedTo', async () => {
    let last: VoicePresence[] = [];
    const unsub = await subscribeRoster('ch1', (r) => { last = r; });
    const now = Math.floor(Date.now() / 1000);

    bridgeFake.inject({
      pubkey: 'A', kind: KIND_VOICE_PRESENCE, content: '',
      tags: [
        ['e', 'ch1'],
        ['expiration', String(now + 30)],
        ['p', 'B'],
        ['p', 'C'],
      ],
      created_at: now,
    });

    expect(last).toHaveLength(1);
    expect(last[0].pubkey).toBe('A');
    expect(last[0].connectedTo).toEqual(['B', 'C']);
    unsub();
  });

  it('drops a self-referential p-tag', async () => {
    let last: VoicePresence[] = [];
    const unsub = await subscribeRoster('ch1', (r) => { last = r; });
    const now = Math.floor(Date.now() / 1000);

    bridgeFake.inject({
      pubkey: 'A', kind: KIND_VOICE_PRESENCE, content: '',
      tags: [['e', 'ch1'], ['expiration', String(now + 30)], ['p', 'A'], ['p', 'B']],
      created_at: now,
    });

    expect(last[0].connectedTo).toEqual(['B']);
    unsub();
  });
});

describe('transitiveParticipants', () => {
  it('unions publishers with their connectedTo lists', () => {
    const now = Math.floor(Date.now() / 1000);
    const result = transitiveParticipants([
      { pubkey: 'A', channelId: 'ch1', createdAt: now, expiresAt: now + 30, connectedTo: ['B', 'C'], videoTracks: [] },
      { pubkey: 'D', channelId: 'ch1', createdAt: now, expiresAt: now + 30, connectedTo: ['E'], videoTracks: [] },
    ]);
    expect(result.sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('survives a missing publisher beacon when another peer mentions them', () => {
    // Scenario: E's beacon is dropped by every relay we subscribe to, but A
    // confirmed a live connection to E and announces it. We must still see
    // E in the participant set so VoiceClient dials them.
    const now = Math.floor(Date.now() / 1000);
    const result = transitiveParticipants([
      { pubkey: 'A', channelId: 'ch1', createdAt: now, expiresAt: now + 30, connectedTo: ['E'], videoTracks: [] },
      { pubkey: 'B', channelId: 'ch1', createdAt: now, expiresAt: now + 30, connectedTo: [], videoTracks: [] },
      { pubkey: 'C', channelId: 'ch1', createdAt: now, expiresAt: now + 30, connectedTo: [], videoTracks: [] },
    ]);
    expect(result).toContain('E');
  });

  it('returns empty for an empty roster', () => {
    expect(transitiveParticipants([])).toEqual([]);
  });
});
