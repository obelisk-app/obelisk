/**
 * The contract between a `Peer` and its owner (`MeshSession` through
 * `mesh-peer.ts`, or a `DmCallSession`): what the owner hears, and what it
 * hands the Peer at construction.
 */
import type { VoiceSignalPayload, VoiceTrackKind } from './types';
import type { QualitySample } from './stats';
import type { VoiceMetrics } from './metrics';

export interface PeerEvents {
  onRemoteTrack(track: MediaStreamTrack, stream: MediaStream, kind: VoiceTrackKind, originPubkey?: string): void;
  onRemoteTrackEnded(trackId: string): void;
  onConnectionStateChange(state: RTCPeerConnectionState): void;
  onConnectionEstablished?(): void;
  onConnectionLost?(): void;
  onQualitySample?(sample: QualitySample): void;
  onTransitivePeers?(remotePeers: string[], remoteBuild: string): void;
  onControlPeerSnapshot?(remotePeers: string[]): void;
  onControlPeerAdded?(pubkey: string): void;
  onControlPeerRemoved?(pubkey: string): void;
  onPeerDead?(reason: string): void;
  /**
   * The remote rebuilt its side and opened a new negotiation (an offer
   * under a different `sessionId`). This Peer is bound to the old session
   * and cannot accept it; the owner should replace the Peer and hand the
   * offer to the new one.
   */
  onRemoteSessionChanged?(offer: VoiceSignalPayload): void;
}

export interface PeerOptions {
  remotePubkey: string;
  /** Preserved public name: the polite side is the non-initiator. */
  polite: boolean;
  /**
   * Identifies this connection attempt, not the client: a rebuilt Peer gets
   * a new one, so signals still in flight for the old attempt can be told
   * apart from the new negotiation.
   */
  sessionId: string;
  /** Disable trickle for remote signers so ICE candidates share one signed SDP. */
  trickle?: boolean;
  connectTimeoutMs?: number;
  bootstrapRecvOnlyMedia?: boolean;
  send: (payload: VoiceSignalPayload) => Promise<void> | void;
  events: PeerEvents;
  iceTransportPolicy?: RTCIceTransportPolicy;
  control?: {
    selfBuild: string;
    metrics: VoiceMetrics;
    getCurrentPeers: () => string[];
  };
}
