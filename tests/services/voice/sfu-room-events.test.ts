import { describe, expect, it, vi } from 'vitest';
import { sfuRoomEvents } from '@/services/voice/sfu-room-events';
import { emptyVoiceMetrics } from '@/services/voice/metrics';
import type { RoomState } from '@/services/voice/room-state';
import type { SfuRemoteTrack } from '@/services/voice/sfu-client';

const SFU = 's'.repeat(64);

function room() {
  return {
    addRemoteTrack: vi.fn(),
    endRemoteTrack: vi.fn(),
    setRoster: vi.fn(),
    connectedPubkeys: new Set<string>(),
  };
}

describe('sfuRoomEvents', () => {
  it('attributes a forwarded track to its producer, via the SFU', () => {
    const r = room();
    const events = sfuRoomEvents(r as unknown as RoomState, emptyVoiceMetrics(), SFU);
    const track = { id: 't' } as MediaStreamTrack;
    events.onRemoteTrack?.({ pubkey: 'alice', trackId: 't1', kind: 'audio', stream: {} as MediaStream, consumer: { track } } as unknown as SfuRemoteTrack);
    events.onRemoteTrack?.({ pubkey: '', trackId: 't2', kind: 'audio', stream: {} as MediaStream, consumer: { track } } as unknown as SfuRemoteTrack);
    expect(r.addRemoteTrack.mock.calls[0][0]).toMatchObject({ pubkey: 'alice', viaPubkey: SFU, trackId: 't1' });
    expect(r.addRemoteTrack.mock.calls[1][0]).toMatchObject({ pubkey: SFU, viaPubkey: SFU });
  });

  it('tracks the SFU connection and mirrors its roster', () => {
    const r = room();
    const events = sfuRoomEvents(r as unknown as RoomState, emptyVoiceMetrics(), SFU);
    events.onConnectionStateChange?.('connected');
    expect(r.connectedPubkeys.has(SFU)).toBe(true);
    events.onConnectionStateChange?.('failed');
    expect(r.connectedPubkeys.has(SFU)).toBe(false);
    events.onPeersChange?.(['alice', 'bob']);
    expect(r.setRoster).toHaveBeenCalledWith(['alice', 'bob']);
  });

  it('counts consume-path trouble in the metrics', () => {
    const metrics = emptyVoiceMetrics();
    const events = sfuRoomEvents(room() as unknown as RoomState, metrics, SFU);
    events.onReliabilityEvent?.({ kind: 'consume-retry', peerPubkey: 'a', producerId: 'p' } as never);
    events.onReliabilityEvent?.({ kind: 'stale-consumer', peerPubkey: 'a', producerId: 'p' } as never);
    expect(metrics.sfuReliability.consumeRetries).toBe(1);
    expect(metrics.sfuReliability.staleConsumer).toBe(1);
    expect(metrics.sfuReliability.consumeFailed).toBe(0);
  });
});
