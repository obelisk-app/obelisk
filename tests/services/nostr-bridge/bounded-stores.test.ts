/**
 * Every in-memory store in the bridge that grows with relay traffic has a
 * cap and an eviction order (round 16, re-audit item 4). One case per
 * store: push well past the cap and check the size never exceeds it, and
 * that what survives is what the stated policy keeps.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { MAX_TOMBSTONES, ModerationModule } from '@/services/nostr-bridge/groups/moderation';
import { MAX_PRESENCE_STAMPS, VoicePresenceModule } from '@/services/nostr-bridge/voice-presence';
import { RelayAccessModule } from '@/services/nostr-bridge/relay-access';
import { StateStore } from '@/services/nostr-bridge/state-store';
import { KIND_EVENT_DELETION, KIND_GROUP_DELETE_EVENT, KIND_VOICE_PRESENCE } from '@/utils/nip-kinds';
import type { RelayAccessState } from '@/services/nostr-bridge/types';

const hex = (n: number, width = 64): string => n.toString(16).padStart(width, '0');

function event(kind: number, tags: string[][], pubkey = hex(1), createdAt = 1_000): NostrEvent {
  return { id: hex(createdAt), pubkey, kind, tags, content: '', created_at: createdAt, sig: '' };
}

describe('ModerationModule tombstones', () => {
  const moderation = () => new ModerationModule(
    {
      relays: () => [],
      subscribeWatched: vi.fn(),
      track: vi.fn(),
      untrack: vi.fn(),
      closeTracked: vi.fn(),
      signAndPublish: vi.fn(),
    },
    { removeMessages: () => new Set<string>(), removeReactions: () => undefined },
  );

  it('keeps at most MAX_TOMBSTONES per class, dropping the oldest deletion first', () => {
    const m = moderation();
    const total = MAX_TOMBSTONES + 250;
    for (let i = 0; i < total; i++) {
      m.ingestEventDeletion('g', event(KIND_EVENT_DELETION, [['e', hex(i)]]));
      m.ingestGroupEventDeletion('g', event(KIND_GROUP_DELETE_EVENT, [['e', hex(i)]]));
    }
    expect(m.tombstoneCount()).toBe(2 * MAX_TOMBSTONES);
    expect(m.isDeletedByAuthor('g', hex(0), hex(1))).toBe(false);
    expect(m.isModerated('g', hex(0))).toBe(false);
    expect(m.isDeletedByAuthor('g', hex(total - 1), hex(1))).toBe(true);
    expect(m.isModerated('g', hex(total - 1))).toBe(true);
  });

  it('keeps tombstones of two groups apart', () => {
    const m = moderation();
    m.ingestGroupEventDeletion('a', event(KIND_GROUP_DELETE_EVENT, [['e', hex(7)]]));
    expect(m.isModerated('a', hex(7))).toBe(true);
    expect(m.isModerated('b', hex(7))).toBe(false);
  });
});

describe('VoicePresenceModule newest-beacon stamps', () => {
  it('keeps at most MAX_PRESENCE_STAMPS, evicting the participant heard from longest ago', () => {
    vi.useFakeTimers();
    try {
      const v = new VoicePresenceModule({ relays: () => [], subscribeWatched: vi.fn(), track: vi.fn() });
      const now = Math.floor(Date.now() / 1000);
      const beacon = (pubkey: string, at: number) => event(
        KIND_VOICE_PRESENCE,
        [['t', 'obelisk-voice-presence'], ['e', 'channel'], ['expiration', String(at + 60)]],
        pubkey,
        at,
      );
      v.ingestMeshVoicePresence(beacon(hex(0), now));
      for (let i = 1; i <= MAX_PRESENCE_STAMPS + 100; i++) {
        v.ingestMeshVoicePresence(beacon(hex(i), now));
        // The first participant keeps beaconing, so LRU keeps their stamp.
        if (i % 500 === 0) v.ingestMeshVoicePresence(beacon(hex(0), now + i));
      }
      expect(v.presenceStampCount()).toBe(MAX_PRESENCE_STAMPS);
      expect(v.activeCallByChannel.get().channel).toBeDefined();
      v.reset();
      expect(v.presenceStampCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RelayAccessModule verdict memory', () => {
  it('remembers the last verdict for at most 64 relays', () => {
    const currentRelayUrl = new StateStore('wss://r0.example');
    const relayAccess = new StateStore<Record<string, RelayAccessState>>({});
    const access = new RelayAccessModule(
      {
        session: () => null,
        relays: () => [currentRelayUrl.get()],
        currentRelayUrl,
        relayAccess,
        subscribeWatched: vi.fn(),
        track: vi.fn(),
        closeTracked: vi.fn(),
      },
      { isDmLeasedRelay: () => false, onAuthOk: vi.fn(), onAccessFail: vi.fn(), ingestOwnMetadata: vi.fn() },
    );
    access.wireAuthSettledHook();
    for (let i = 0; i < 200; i++) {
      const url = `wss://r${i}.example`;
      currentRelayUrl.set(url);
      relayAccess.set({ [url]: 'ok' });
    }
    expect(access.rememberedVerdictCount()).toBe(64);
  });
});
