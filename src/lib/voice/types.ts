/**
 * Voice channel wire types. v1 ships plaintext signed ephemeral events.
 * See `src/lib/nip-kinds.ts` (KIND_VOICE_PRESENCE, KIND_VOICE_SIGNAL) and
 * docs/webrtc-p2p-nostr-signaling.md.
 */

export type VoiceTrackKind = 'audio' | 'camera' | 'screen' | 'screen-audio';

export type VoiceSignalType = 'offer' | 'answer' | 'ice' | 'bye' | 'trackinfo' | 'qualityhint';

export interface VoiceQualityHint {
  /** Max vertical resolution requested for the sender's outbound video.
   *  Null means "no cap" (auto). */
  maxHeight: number | null;
  maxFramerate: number | null;
  maxBitrate: number | null;
}

export interface VoiceSignalPayload {
  type: VoiceSignalType;
  /** SDP for offer/answer. */
  sdp?: string;
  /** Batched ICE candidates for `type: 'ice'`. */
  candidates?: RTCIceCandidateInit[];
  /** Out-of-band track-kind announcement so the receiver knows which slot a
   *  track maps to before the actual `ontrack` fires. */
  trackInfo?: { trackId: string; kind: VoiceTrackKind };
  /** Receiver-driven cap: "please don't send me more than this". */
  qualityHint?: VoiceQualityHint;
  /** Random per-session id so a peer who left and rejoined isn't confused
   *  with their previous incarnation. */
  sessionId: string;
  /** Monotonic per-(from,to) sequence; receivers drop out-of-order ICE only,
   *  not offers/answers (perfect negotiation handles glare separately). */
  seq: number;
}

export interface VoicePresence {
  pubkey: string;
  channelId: string;
  /** Wall-clock seconds (relay's `created_at`). Stale if older than ~30s. */
  createdAt: number;
  /** Wall-clock seconds when the beacon should be considered gone. */
  expiresAt: number;
}
