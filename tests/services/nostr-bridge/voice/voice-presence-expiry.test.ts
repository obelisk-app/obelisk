import { afterEach, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { VoicePresenceModule } from '@/services/nostr-bridge/voice/voice-presence';
import { KIND_SFU_ACTIVE_CALL, KIND_VOICE_PRESENCE } from '@/constants/nostr/nip-kinds';

afterEach(() => vi.useRealTimers());

it('expires public SFU advertisements and mesh participants in the existing shared sweep without more requests', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
  const now = Math.floor(Date.now() / 1000);
  const sinks = new Map<number, (event: NostrEvent) => void>();
  const subscribe = vi.fn((_relays: string[], filter: Filter, callback: (event: NostrEvent) => void) => {
    sinks.set(filter.kinds![0], callback);
    return { close: vi.fn() };
  });
  const presence = new VoicePresenceModule({ relays: () => ['wss://active.example'], subscribeWatched: subscribe, track: vi.fn() });
  presence.subscribe();
  const emit = (kind: number, tags: string[][]) => sinks.get(kind)!({
    id: String(kind), pubkey: 'a'.repeat(64), kind, created_at: now, content: '', tags, sig: '',
  });
  emit(KIND_SFU_ACTIVE_CALL, [['d', 'sfu'], ['expiration', String(now + 5)], ['count', '1'], ['p', 'b'.repeat(64)]]);
  emit(KIND_VOICE_PRESENCE, [['e', 'mesh'], ['t', 'obelisk-voice-presence'], ['expiration', String(now + 20)]]);
  expect(presence.activeCallByChannel.get().sfu.participantPubkeys).toEqual(['b'.repeat(64)]);
  expect(presence.activeCallByChannel.get().mesh.participantCount).toBe(1);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(15_000);
  expect(presence.activeCallByChannel.get().sfu).toBeUndefined();
  expect(presence.activeCallByChannel.get().mesh).toBeDefined();
  vi.advanceTimersByTime(15_000);
  expect(presence.activeCallByChannel.get()).toEqual({});
  expect(subscribe).toHaveBeenCalledTimes(2);
  presence.reset();
  expect(vi.getTimerCount()).toBe(0);
});
