/**
 * The shapes a `DmCallSession` speaks (phases, the media snapshot, its
 * options), its timing limits, and two small helpers. Re-exported from
 * `session.ts`.
 */
import { isOffer } from '@/utils/voice/signal-payload';
import type { Peer, PeerOptions } from '@/services/voice/peer';
import type { VoiceSignalPayload } from '@/types/voice/protocol';
import type { CallPoolLike } from './signaling';

export type DmCallPhase = 'connecting' | 'connected' | 'reconnecting' | 'ended';

export interface DmCallMediaState {
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  localVideo: MediaStream | null;
  localScreen: MediaStream | null;
  remoteAudio: MediaStream | null;
  remoteVideo: MediaStream | null;
  remoteScreen: MediaStream | null;
}

export interface DmCallSessionOptions {
  role: 'caller' | 'callee';
  callId: string;
  selfSk: Uint8Array;
  relays: readonly string[];
  video: boolean;
  /** `'relay'` hides our IP from the other side by forcing TURN. */
  iceTransportPolicy: RTCIceTransportPolicy;
  onPhase: (phase: DmCallPhase, reason?: string) => void;
  onMedia: (media: DmCallMediaState) => void;
  /** Caller only: the callee is on the call relay (its hello arrived). */
  onPeerJoined?: () => void;
  /** Test seams. */
  pool?: CallPoolLike;
  createPeer?: (opts: PeerOptions) => Peer;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
}

export function sessionId(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Message numbers are monotonic per sender. Anything numbered before the
 * newest offer but belonging to another session is a late re-send from a
 * negotiation the other side already replaced: never let it through.
 */
export class OfferGate {
  /** Newest offer seen from the other side: its message number and session. */
  private lastOffer: { id: number; session: string } | null = null;

  admit(payload: VoiceSignalPayload, id: number): boolean {
    if (this.lastOffer && id < this.lastOffer.id && payload.sessionId && payload.sessionId !== this.lastOffer.session) return false;
    if (isOffer(payload) && payload.sessionId) {
      if (this.lastOffer && id < this.lastOffer.id) return false;
      this.lastOffer = { id, session: payload.sessionId };
    }
    return true;
  }
}
