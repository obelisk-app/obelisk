/**
 * What the SFU client reports, written into the room: forwarded tracks,
 * the SFU's own connection state, the roster (the SFU is its source of
 * truth) and the consume-path reliability counters. Used by the bootstrap.
 */
import type { SfuClientEvents, SfuReliabilityEvent, SfuRemoteTrack } from './sfu-client';
import type { RoomState } from './room-state';
import type { VoiceMetrics } from './metrics';
import { pushVoiceDebug } from './debug';

export function sfuRoomEvents(room: RoomState, metrics: VoiceMetrics, sfuPubkey: string): SfuClientEvents {
  return {
    onRemoteTrack: (t: SfuRemoteTrack) => {
      room.addRemoteTrack({
        pubkey: t.pubkey || sfuPubkey,
        viaPubkey: sfuPubkey,
        trackId: t.trackId,
        kind: t.kind,
        stream: t.stream,
      }, t.consumer.track);
    },
    onRemoteTrackEnded: (trackId: string) => {
      room.endRemoteTrack(trackId);
    },
    onConnectionStateChange: (state: string) => {
      if (state === 'connected') {
        room.connectedPubkeys.add(sfuPubkey);
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        room.connectedPubkeys.delete(sfuPubkey);
      }
    },
    onPeersChange: (pubkeys: string[]) => {
      // SFU is the source of truth for the participant list in SFU
      // mode. Mirror it directly into the renderable roster - no
      // beacon discovery, no transitive merging.
      try {
        room.setRoster(pubkeys);
      } catch (err) {
        console.warn('[voice] onParticipantsChange handler threw', err);
      }
    },
    onReliabilityEvent: (ev: SfuReliabilityEvent) => {
      // SFU consume-path reliability telemetry - see SfuClient for
      // when each kind fires. Mirrored into VoiceMetrics so the
      // ?debug=voice overlay shows a running tally and so the
      // playwright harness can assert on regressions.
      if (ev.kind === 'consume-retry') {
        metrics.sfuReliability.consumeRetries += 1;
      } else if (ev.kind === 'consume-failed') {
        metrics.sfuReliability.consumeFailed += 1;
      } else if (ev.kind === 'stale-consumer') {
        metrics.sfuReliability.staleConsumer += 1;
      }
      pushVoiceDebug({
        kind: 'sfu-reliability',
        reason: ev.kind,
        peer: ev.peerPubkey,
        payload: {
          producerId: ev.producerId,
          attempt: ev.attempt,
          code: ev.errorCode,
          msg: ev.errorMessage,
        },
      });
    },
  };
}
