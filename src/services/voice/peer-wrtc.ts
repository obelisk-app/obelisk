/**
 * How a `Peer` constructs its simple-peer instance, and the WebRTC
 * constructors simple-peer is handed. Browsers have all three; the
 * fallbacks are for environments (jsdom, the test doubles) that expose
 * `RTCPeerConnection` without `RTCSessionDescription` / `RTCIceCandidate`,
 * where simple-peer only needs objects that round-trip through `toJSON`.
 */
import SimplePeer from 'simple-peer';
import { CONTROL_CHANNEL_LABEL } from '@/constants/voice/control-channel';
import { ICE_SERVERS } from './ice-config';
import type { VoiceSignalPayload } from '@/types/voice/protocol';

export function newSimplePeer(config: {
  initiator: boolean;
  trickle: boolean;
  iceTransportPolicy: RTCIceTransportPolicy;
}): SimplePeer.Instance {
  return new SimplePeer({
    initiator: config.initiator,
    trickle: config.trickle,
    wrtc: browserWrtc(),
    config: {
      iceServers: ICE_SERVERS,
      iceTransportPolicy: config.iceTransportPolicy,
      iceCandidatePoolSize: 4,
    },
    channelName: CONTROL_CHANNEL_LABEL,
    channelConfig: { ordered: true },
  });
}

export function browserWrtc(): NonNullable<SimplePeer.Options['wrtc']> {
  const g = globalThis as typeof globalThis & {
    RTCPeerConnection: typeof RTCPeerConnection;
    RTCSessionDescription?: typeof RTCSessionDescription;
    RTCIceCandidate?: typeof RTCIceCandidate;
  };
  const SessionDescription = g.RTCSessionDescription ?? class {
    type: RTCSdpType;
    sdp: string;
    constructor(init: RTCSessionDescriptionInit) {
      this.type = init.type;
      this.sdp = init.sdp ?? '';
    }
    toJSON() { return { type: this.type, sdp: this.sdp }; }
  } as unknown as typeof RTCSessionDescription;
  const IceCandidate = g.RTCIceCandidate ?? class {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
    usernameFragment: string | null;
    constructor(init: RTCIceCandidateInit) {
      this.candidate = init.candidate ?? '';
      this.sdpMid = init.sdpMid ?? null;
      this.sdpMLineIndex = init.sdpMLineIndex ?? null;
      this.usernameFragment = init.usernameFragment ?? null;
    }
    toJSON() {
      return {
        candidate: this.candidate,
        sdpMid: this.sdpMid,
        sdpMLineIndex: this.sdpMLineIndex,
        usernameFragment: this.usernameFragment,
      };
    }
  } as unknown as typeof RTCIceCandidate;
  return {
    RTCPeerConnection: g.RTCPeerConnection,
    RTCSessionDescription: SessionDescription,
    RTCIceCandidate: IceCandidate,
  };
}

/**
 * Hand one wire signal to simple-peer: its own signal blob, a legacy offer
 * or answer, or a batch of ICE candidates. Anything else is not simple-peer's
 * business. Throws whatever simple-peer throws; `Peer.handleSignal` reports it.
 */
export function feedSimplePeer(simple: SimplePeer.Instance, payload: VoiceSignalPayload): void {
  if (payload.type === 'peer' && payload.peerSignal) {
    simple.signal(payload.peerSignal as SimplePeer.SignalData);
  } else if ((payload.type === 'offer' || payload.type === 'answer') && payload.sdp) {
    simple.signal({ type: payload.type, sdp: payload.sdp });
  } else if (payload.type === 'ice') {
    for (const candidate of payload.candidates ?? []) {
      simple.signal({ type: 'candidate', candidate: candidate as RTCIceCandidate });
    }
  }
}
