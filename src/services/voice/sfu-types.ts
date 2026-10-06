/**
 * The contract between `SfuClient` and its owner (`SfuSession`): what a
 * forwarded track looks like, the reliability telemetry, and the event
 * sink. Kept apart from the client so its collaborators (the consume
 * queue, the consumer registry, the stale watchdog, the peer roster) can
 * share the types without importing the client they serve.
 */
import type { Consumer } from 'mediasoup-client/types';

import type { VoiceTrackKind } from './types';

export interface SfuRemoteTrack {
  /** Origin pubkey (the *producer's* author, not the SFU). */
  pubkey: string;
  trackId: string;
  kind: VoiceTrackKind;
  stream: MediaStream;
  consumer: Consumer;
}

/**
 * Reliability-layer telemetry. Surfaced through `onReliabilityEvent` so
 * `VoiceClient` can roll up counters into `VoiceMetrics` and the
 * `?debug=voice` overlay can show them in the field. Emitted on three
 * distinct conditions:
 *
 *   `consume-retry`  - a transient failure (RPC timeout, NO_PEER, …) was
 *                      caught and another attempt is scheduled. `attempt`
 *                      is the number of attempts made so far (1-indexed).
 *   `consume-failed` - gave up on this producer after the backoff ladder
 *                      was exhausted or a permanent error code (e.g.
 *                      `CANNOT_CONSUME`) was returned. The track will
 *                      not appear without a fresh `newProducer` event.
 *   `stale-consumer` - a consumer's `bytesReceived` hasn't moved for
 *                      `STALE_TIMEOUT_MS` despite the consumer being
 *                      live and unpaused: wedged. The consumer is torn
 *                      down and a fresh `consume` is requeued.
 */
export interface SfuReliabilityEvent {
  kind: 'consume-retry' | 'consume-failed' | 'stale-consumer';
  producerId: string;
  peerPubkey?: string;
  attempt?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface SfuClientEvents {
  onRemoteTrack(track: SfuRemoteTrack): void;
  onRemoteTrackEnded(trackId: string): void;
  onConnectionStateChange?(state: string): void;
  /**
   * Fires whenever the SFU-tracked participant set changes. The SFU pushes
   * `peerJoined`, `peerLeft`, and an initial `participantList` snapshot
   * over kind 25050 RPC notifications; this client maintains the union and
   * emits the deduped pubkey list. The local user is NOT included.
   *
   * Replaces the kind 20078 beacon-driven roster in SFU mode; the SFU is
   * the authoritative source for who's actually wired up to the room.
   */
  onPeersChange?(pubkeys: string[]): void;
  /**
   * Reliability-layer telemetry: see `SfuReliabilityEvent` for the kinds
   * and when they fire. Optional; if not wired the events are silent.
   */
  onReliabilityEvent?(ev: SfuReliabilityEvent): void;
}

/** What the SFU passes through unchanged from a producer's `appData`. */
export interface ProducerAppData {
  kind?: VoiceTrackKind;
  originPubkey?: string;
}
