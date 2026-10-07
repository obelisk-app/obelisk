/**
 * Every in-memory store in the bridge that grows with relay traffic has a
 * cap and an eviction order (round 16, re-audit item 4). One case per
 * store: push well past the cap and check the size never exceeds it, and
 * that what survives is what the stated policy keeps.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { MAX_TOMBSTONES, ModerationModule } from '@/services/nostr-bridge/groups/message/moderation';
import { MAX_PRESENCE_STAMPS, VoicePresenceModule } from '@/services/nostr-bridge/voice/voice-presence';
import { RelayAccessModule } from '@/services/nostr-bridge/relay/relay-access';
import { DmStoreModule, MAX_DEFERRED, MAX_HELD } from '@/services/nostr-bridge/dm/store';
import { StateStore } from '@/services/nostr-bridge/common/state-store';
import { KIND_EVENT_DELETION, KIND_GROUP_DELETE_EVENT, KIND_VOICE_PRESENCE } from '@/utils/nostr/nip-kinds';
import type { RelayAccessState } from '@/services/nostr-bridge/common/types';

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

describe('DmStoreModule, held while locked', () => {
  it('holds at most MAX_HELD events and MAX_DEFERRED waits, dropping the oldest first', async () => {
    // No IndexedDB here: the unlock below opens for the visit without a key.
    const signer = { pubkey: hex(1), signEvent: vi.fn(), nip44Encrypt: vi.fn(), nip44Decrypt: vi.fn() };
    const reingest = vi.fn();
    const store = new DmStoreModule({ nipSigner: () => signer, replay: vi.fn(), reingest, dmsEnabled: () => true });
    store.attach(hex(1));
    for (let i = 0; i < MAX_HELD + 50; i++) store.hold(event(1059, [['p', hex(1)]], hex(2), i + 1), 'wrap');
    const unopened = store.lock.get().unopened;
    expect(unopened).toHaveLength(MAX_HELD);
    expect(unopened[0]).toBe(51 * 1000);
    const waits = Array.from({ length: MAX_DEFERRED + 10 }, () => vi.fn());
    for (const fn of waits) store.defer(fn);
    expect(waits.filter((fn) => fn.mock.calls.length > 0)).toHaveLength(0);
    await store.unlock();
    expect(reingest).toHaveBeenCalledTimes(MAX_HELD);
    expect(waits.slice(0, 10).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(waits.slice(10).every((fn) => fn.mock.calls.length === 1)).toBe(true);
  });
});
