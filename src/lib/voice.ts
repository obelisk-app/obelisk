/**
 * P2P Mesh WebRTC Voice/Video/Screen Client
 *
 * Every participant opens a direct RTCPeerConnection to every other
 * participant. The server only relays signaling (SDP + ICE + track-type)
 * — media never touches the server. Bandwidth is bounded by each peer's
 * own uplink, not shared server capacity, so we can run full-rate video
 * (720p30 camera, up to 60fps screen share) without SFU concerns.
 *
 * Scaling trade-off: uplink is O(N-1). Fine for small rooms (2–6), starts
 * to hurt past ~8 participants — expected mesh behavior.
 */

import type { Socket } from 'socket.io-client';

export interface VoiceParticipant {
  pubkey: string;
  muted: boolean;
  deafened: boolean;
  joinedAt: string;
}

type TrackType = 'audio' | 'camera' | 'screen' | 'screen-audio';

interface PeerConn {
  socketId: string;
  pubkey: string;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  // Outgoing senders per track type
  senders: Partial<Record<TrackType, RTCRtpSender>>;
  // Remote trackId → track type (sent out-of-band before ontrack fires)
  remoteTrackTypes: Map<string, TrackType>;
  // Tracks that fired ontrack before we learned their type
  pendingTracks: Map<string, MediaStreamTrack>;
  audioElement: HTMLAudioElement | null;
  screenAudioElement: HTMLAudioElement | null;
  cameraElement: HTMLVideoElement | null;
  screenElement: HTMLVideoElement | null;
}

// User-tunable quality — read from localStorage so the Settings modal can change it.
export interface VoiceQualitySettings {
  cameraWidth: number;
  cameraHeight: number;
  cameraFps: number;
  cameraMaxBitrate: number;
  screenFps: number;
  screenMaxBitrate: number;
}
const VOICE_QUALITY_DEFAULTS: VoiceQualitySettings = {
  cameraWidth: 1280,
  cameraHeight: 720,
  cameraFps: 60,
  cameraMaxBitrate: 4_000_000,
  screenFps: 60,
  screenMaxBitrate: 10_000_000,
};
export function getVoiceQuality(): VoiceQualitySettings {
  if (typeof localStorage === 'undefined') return VOICE_QUALITY_DEFAULTS;
  try {
    const raw = localStorage.getItem('voice-quality');
    if (raw) return { ...VOICE_QUALITY_DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return VOICE_QUALITY_DEFAULTS;
}
export function setVoiceQuality(partial: Partial<VoiceQualitySettings>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const merged = { ...getVoiceQuality(), ...partial };
    localStorage.setItem('voice-quality', JSON.stringify(merged));
  } catch {}
}

// Bump Opus bitrate in outgoing SDP without touching risky params (stereo/dtx).
// Safari silently drops the audio section when sprop-stereo or usedtx are forced,
// so we only *merge* maxaveragebitrate/useinbandfec into the existing fmtp line
// and leave everything the browser negotiated on its own.
function enhanceOpusSdp(desc: RTCSessionDescription | null): RTCSessionDescriptionInit | null {
  if (!desc?.sdp) return desc;
  const lines = desc.sdp.split(/\r\n/);
  const opusPts = new Set<string>();
  for (const line of lines) {
    const m = /^a=rtpmap:(\d+)\s+opus\/48000\/2/i.exec(line);
    if (m) opusPts.add(m[1]);
  }
  if (opusPts.size === 0) return desc;
  const wanted: Record<string, string> = {
    maxaveragebitrate: '128000',
    maxplaybackrate: '48000',
    useinbandfec: '1',
  };
  const next = lines.map((line) => {
    const fmtp = /^a=fmtp:(\d+)\s+(.*)$/.exec(line);
    if (!fmtp || !opusPts.has(fmtp[1])) return line;
    const existing = new Map<string, string>();
    for (const kv of fmtp[2].split(';')) {
      const [k, v] = kv.split('=');
      if (k) existing.set(k.trim(), (v ?? '').trim());
    }
    for (const [k, v] of Object.entries(wanted)) {
      if (!existing.has(k)) existing.set(k, v);
    }
    const merged = Array.from(existing.entries())
      .map(([k, v]) => (v ? `${k}=${v}` : k))
      .join(';');
    return `a=fmtp:${fmtp[1]} ${merged}`;
  });
  return { type: desc.type, sdp: next.join('\r\n') };
}

const ICE_SERVERS: RTCIceServer[] = (() => {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_URL : undefined;
  const turnUser = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_USERNAME : undefined;
  const turnPass = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_PASSWORD : undefined;
  if (turnUrl && turnUser && turnPass) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnPass });
  }
  return servers;
})();

export class WebSocketVoiceClient {
  private socket: Socket;
  private peers: Map<string, PeerConn> = new Map(); // remote socketId → peer
  private mySocketId: string | null = null;

  // Local tracks
  private audioStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private screenAudioTrack: MediaStreamTrack | null = null;

  private channelId: string | null = null;
  private isMuted = false;
  private isDeafened = false;

  // Callbacks (preserved API)
  onConnectionStateChange?: (state: string) => void;
  onError?: (error: string) => void;
  onForceMute?: (reason: string) => void;
  onForceCameraOff?: (reason: string) => void;
  onForceScreenOff?: (reason: string) => void;
  onRemoteVideoElement?: (pubkey: string, element: HTMLVideoElement | null) => void;
  onRemoteScreenElement?: (pubkey: string, element: HTMLVideoElement | null) => void;
  onLocalCameraStream?: (stream: MediaStream | null) => void;
  onLocalScreenStream?: (stream: MediaStream | null) => void;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  // ── Join / Leave ─────────────────────────────────────────────

  async join(channelId: string): Promise<void> {
    this.channelId = channelId;
    this.mySocketId = this.socket.id || null;

    // Capture mic first so the initial offer to each peer already has the track.
    this.audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
      video: false,
    });
    this.audioTrack = this.audioStream.getAudioTracks()[0] || null;
    if (this.audioTrack) this.audioTrack.contentHint = 'speech';

    this.socket.on('voice-peer-joined', this.handlePeerJoined);
    this.socket.on('voice-peer-left', this.handlePeerLeft);
    this.socket.on('voice-signal', this.handleSignal);
    this.socket.on('voice-force-mute', this.handleForceMute);
    this.socket.on('voice-force-camera-off', this.handleForceCameraOff);
    this.socket.on('voice-force-screen-off', this.handleForceScreenOff);

    const res = await this.emitWithAck('join-voice', channelId);
    if (res?.error) throw new Error(res.error);
    this.mySocketId = res.selfSocketId || this.socket.id || null;

    // Open a PC to each existing peer. We are the "new" arrival, so we
    // initiate — our `onnegotiationneeded` will fire once we addTrack.
    // Dedup: an early `voice-signal` during the ack await can cause
    // `handleSignal` to auto-create the peer before we get here. Calling
    // createPeer again would orphan the first RTCPeerConnection — its
    // pending offer's answer would then route to the replacement PC
    // (wrong m-lines), and the existing peer's mic/camera never attach.
    for (const peer of (res.peers || []) as Array<{ socketId: string; pubkey: string }>) {
      if (this.peers.has(peer.socketId)) continue;
      this.createPeer(peer.socketId, peer.pubkey);
    }

    this.onConnectionStateChange?.('connected');
  }

  async leave(): Promise<void> {
    await this.stopCamera();
    await this.stopScreenShare();

    this.socket.off('voice-peer-joined', this.handlePeerJoined);
    this.socket.off('voice-peer-left', this.handlePeerLeft);
    this.socket.off('voice-signal', this.handleSignal);
    this.socket.off('voice-force-mute', this.handleForceMute);
    this.socket.off('voice-force-camera-off', this.handleForceCameraOff);
    this.socket.off('voice-force-screen-off', this.handleForceScreenOff);

    for (const peer of this.peers.values()) {
      this.closePeer(peer);
    }
    this.peers.clear();

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
      this.audioTrack = null;
    }

    if (this.channelId) {
      this.socket.emit('leave-voice', this.channelId);
    }
    this.channelId = null;
    this.onConnectionStateChange?.('disconnected');
  }

  destroy(): void { this.leave(); }

  // ── Audio controls ───────────────────────────────────────────

  mute(): void {
    this.isMuted = true;
    if (this.audioTrack) this.audioTrack.enabled = false;
  }

  unmute(): void {
    this.isMuted = false;
    if (this.audioTrack) this.audioTrack.enabled = true;
  }

  setDeafened(deafened: boolean): void {
    this.isDeafened = deafened;
    for (const peer of this.peers.values()) {
      if (peer.audioElement) peer.audioElement.muted = deafened;
      if (peer.screenAudioElement) peer.screenAudioElement.muted = deafened;
      if (peer.cameraElement) peer.cameraElement.muted = deafened;
      if (peer.screenElement) peer.screenElement.muted = deafened;
    }
  }

  // ── Camera ───────────────────────────────────────────────────

  async startCamera(): Promise<void> {
    if (this.cameraStream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera is not supported on this device');
    }
    const q = getVoiceQuality();
    if (this.channelId) {
      const claim = await this.emitWithAck('voice-camera-claim', this.channelId);
      if (claim?.error) throw new Error(claim.error);
    }
    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: q.cameraWidth },
        height: { ideal: q.cameraHeight },
        frameRate: { ideal: q.cameraFps, max: q.cameraFps },
      },
      audio: false,
    });
    this.cameraTrack = this.cameraStream.getVideoTracks()[0] || null;
    this.onLocalCameraStream?.(this.cameraStream);

    if (this.cameraTrack) {
      for (const peer of this.peers.values()) {
        this.sendTrackInfo(peer, this.cameraTrack.id, 'camera');
        const sender = peer.pc.addTrack(this.cameraTrack, this.cameraStream);
        peer.senders.camera = sender;
        this.tuneVideoSender(sender, q.cameraMaxBitrate, q.cameraFps);
      }
    }
  }

  async stopCamera(): Promise<void> {
    if (this.cameraTrack) {
      for (const peer of this.peers.values()) {
        const sender = peer.senders.camera;
        if (sender) {
          try { peer.pc.removeTrack(sender); } catch {}
          delete peer.senders.camera;
        }
      }
      this.cameraTrack.stop();
      this.cameraTrack = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
      this.onLocalCameraStream?.(null);
    }
    if (this.channelId) {
      this.socket.emit('voice-camera-release', this.channelId);
    }
  }

  // ── Screen Share ─────────────────────────────────────────────

  async startScreenShare(): Promise<void> {
    if (this.screenStream) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing is not supported on this device');
    }
    // Ask the server for exclusive screen-share rights first.
    if (this.channelId) {
      const claim = await this.emitWithAck('voice-screen-claim', this.channelId);
      if (claim?.error) {
        throw new Error(claim.error);
      }
    }
    const q = getVoiceQuality();
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: q.screenFps, max: q.screenFps },
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
      },
      // Browsers that don't support share-audio will silently return no audio track.
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.screenTrack = this.screenStream.getVideoTracks()[0] || null;
    this.screenAudioTrack = this.screenStream.getAudioTracks()[0] || null;
    if (this.screenTrack) {
      // 'detail' keeps text/UI sharp; 'motion' blurs it into mush.
      this.screenTrack.contentHint = 'detail';
      this.screenTrack.onended = () => { this.stopScreenShare(); };
    }
    if (this.screenAudioTrack) this.screenAudioTrack.contentHint = 'music';
    this.onLocalScreenStream?.(this.screenStream);

    if (this.screenTrack) {
      for (const peer of this.peers.values()) {
        this.sendTrackInfo(peer, this.screenTrack.id, 'screen');
        const sender = peer.pc.addTrack(this.screenTrack, this.screenStream);
        peer.senders.screen = sender;
        this.tuneVideoSender(sender, q.screenMaxBitrate, q.screenFps, 'maintain-resolution');
      }
    }
    if (this.screenAudioTrack) {
      for (const peer of this.peers.values()) {
        this.sendTrackInfo(peer, this.screenAudioTrack.id, 'screen-audio');
        peer.senders['screen-audio'] = peer.pc.addTrack(this.screenAudioTrack, this.screenStream);
      }
    }
  }

  async stopScreenShare(): Promise<void> {
    if (this.screenTrack) {
      for (const peer of this.peers.values()) {
        const sender = peer.senders.screen;
        if (sender) {
          try { peer.pc.removeTrack(sender); } catch {}
          delete peer.senders.screen;
        }
      }
      this.screenTrack.stop();
      this.screenTrack = null;
    }
    if (this.screenAudioTrack) {
      for (const peer of this.peers.values()) {
        const sender = peer.senders['screen-audio'];
        if (sender) {
          try { peer.pc.removeTrack(sender); } catch {}
          delete peer.senders['screen-audio'];
        }
      }
      this.screenAudioTrack.stop();
      this.screenAudioTrack = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
      this.onLocalScreenStream?.(null);
    }
    if (this.channelId) {
      this.socket.emit('voice-screen-release', this.channelId);
    }
  }

  // ── Peer management ──────────────────────────────────────────

  private createPeer(remoteSocketId: string, remotePubkey: string): PeerConn {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Polite peer = the one with the lexicographically larger socketId.
    // Perfect-negotiation rollback happens on the polite side.
    const polite = (this.mySocketId || '') > remoteSocketId;

    const peer: PeerConn = {
      socketId: remoteSocketId,
      pubkey: remotePubkey,
      pc,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      senders: {},
      remoteTrackTypes: new Map(),
      pendingTracks: new Map(),
      audioElement: null,
      screenAudioElement: null,
      cameraElement: null,
      screenElement: null,
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket.emit('voice-signal', {
          toSocketId: remoteSocketId,
          payload: { ice: candidate.toJSON() },
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.socket.emit('voice-signal', {
          toSocketId: remoteSocketId,
          payload: { sdp: enhanceOpusSdp(pc.localDescription) },
        });
      } catch (err) {
        console.error('[voice] negotiation error:', err);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.ontrack = (ev) => {
      const track = ev.track;
      const type = peer.remoteTrackTypes.get(track.id);
      if (type) {
        this.attachRemoteTrack(peer, track, type);
      } else {
        peer.pendingTracks.set(track.id, track);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[voice] peer', remotePubkey.slice(0, 8), 'connection:', pc.connectionState);
      if (pc.connectionState === 'failed') {
        this.onError?.(`Peer ${remotePubkey.slice(0, 8)} connection failed`);
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log('[voice] peer', remotePubkey.slice(0, 8), 'ice:', pc.iceConnectionState);
    };

    // Always send our mic track so the first offer carries audio.
    if (this.audioTrack && this.audioStream) {
      this.sendTrackInfo(peer, this.audioTrack.id, 'audio');
      const s = pc.addTrack(this.audioTrack, this.audioStream);
      peer.senders.audio = s;
      this.tuneAudioSender(s);
    }
    // If camera/screen are already on (rejoining peers mid-share), add them too.
    if (this.cameraTrack && this.cameraStream) {
      const q = getVoiceQuality();
      this.sendTrackInfo(peer, this.cameraTrack.id, 'camera');
      const s = pc.addTrack(this.cameraTrack, this.cameraStream);
      peer.senders.camera = s;
      this.tuneVideoSender(s, q.cameraMaxBitrate, q.cameraFps);
    }
    if (this.screenTrack && this.screenStream) {
      const q = getVoiceQuality();
      this.sendTrackInfo(peer, this.screenTrack.id, 'screen');
      const s = pc.addTrack(this.screenTrack, this.screenStream);
      peer.senders.screen = s;
      this.tuneVideoSender(s, q.screenMaxBitrate, q.screenFps, 'maintain-resolution');
    }
    if (this.screenAudioTrack && this.screenStream) {
      this.sendTrackInfo(peer, this.screenAudioTrack.id, 'screen-audio');
      peer.senders['screen-audio'] = pc.addTrack(this.screenAudioTrack, this.screenStream);
    }

    this.peers.set(remoteSocketId, peer);
    return peer;
  }

  private closePeer(peer: PeerConn): void {
    try { peer.pc.close(); } catch {}
    if (peer.audioElement) {
      peer.audioElement.pause();
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
      peer.audioElement = null;
    }
    if (peer.screenAudioElement) {
      peer.screenAudioElement.pause();
      peer.screenAudioElement.srcObject = null;
      peer.screenAudioElement.remove();
      peer.screenAudioElement = null;
    }
    if (peer.cameraElement) {
      peer.cameraElement.pause();
      peer.cameraElement.srcObject = null;
      peer.cameraElement = null;
      this.onRemoteVideoElement?.(peer.pubkey, null);
    }
    if (peer.screenElement) {
      peer.screenElement.pause();
      peer.screenElement.srcObject = null;
      peer.screenElement = null;
      this.onRemoteScreenElement?.(peer.pubkey, null);
    }
  }

  private attachRemoteTrack(peer: PeerConn, track: MediaStreamTrack, type: TrackType): void {
    const stream = new MediaStream([track]);

    if (type === 'audio' || type === 'screen-audio') {
      // Attach to DOM for reliable autoplay in Chromium/Safari.
      const el = document.createElement('audio');
      el.srcObject = stream;
      el.autoplay = true;
      el.muted = this.isDeafened;
      (el as any).playsInline = true;
      el.style.display = 'none';
      document.body.appendChild(el);
      el.play().catch((err) => {
        console.warn('[voice] audio play() blocked — will retry on user gesture:', err);
      });
      if (type === 'audio') peer.audioElement = el;
      else peer.screenAudioElement = el;
      return;
    }

    const videoEl = document.createElement('video');
    videoEl.srcObject = stream;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;

    track.onended = () => {
      if (type === 'camera' && peer.cameraElement === videoEl) {
        peer.cameraElement = null;
        this.onRemoteVideoElement?.(peer.pubkey, null);
      } else if (type === 'screen' && peer.screenElement === videoEl) {
        peer.screenElement = null;
        this.onRemoteScreenElement?.(peer.pubkey, null);
      }
    };
    track.onmute = () => {
      // sender removed the track — treat as ended
      if (type === 'camera' && peer.cameraElement === videoEl) {
        peer.cameraElement = null;
        this.onRemoteVideoElement?.(peer.pubkey, null);
      } else if (type === 'screen' && peer.screenElement === videoEl) {
        peer.screenElement = null;
        this.onRemoteScreenElement?.(peer.pubkey, null);
      }
    };

    if (type === 'camera') {
      peer.cameraElement = videoEl;
      this.onRemoteVideoElement?.(peer.pubkey, videoEl);
    } else {
      peer.screenElement = videoEl;
      this.onRemoteScreenElement?.(peer.pubkey, videoEl);
    }
  }

  private sendTrackInfo(peer: PeerConn, trackId: string, type: TrackType): void {
    this.socket.emit('voice-signal', {
      toSocketId: peer.socketId,
      payload: { trackInfo: { trackId, type } },
    });
  }

  private tuneVideoSender(
    sender: RTCRtpSender,
    maxBitrate: number,
    maxFramerate: number,
    degradationPreference: RTCDegradationPreference = 'maintain-framerate',
  ): void {
    try {
      const params = sender.getParameters() as RTCRtpSendParameters & {
        degradationPreference?: RTCDegradationPreference;
      };
      params.encodings = params.encodings && params.encodings.length > 0
        ? params.encodings
        : [{}];
      params.encodings[0].maxBitrate = maxBitrate;
      (params.encodings[0] as any).maxFramerate = maxFramerate;
      params.degradationPreference = degradationPreference;
      sender.setParameters(params).catch((err) => {
        console.warn('[voice] setParameters failed:', err);
      });
    } catch (err) {
      console.warn('[voice] getParameters failed:', err);
    }
  }

  private tuneAudioSender(sender: RTCRtpSender, maxBitrate = 128_000): void {
    try {
      const params = sender.getParameters();
      params.encodings = params.encodings && params.encodings.length > 0
        ? params.encodings
        : [{}];
      params.encodings[0].maxBitrate = maxBitrate;
      sender.setParameters(params).catch(() => {});
    } catch {}
  }

  // ── Signaling handlers ───────────────────────────────────────

  private handlePeerJoined = ({ socketId, pubkey }: { socketId: string; pubkey: string }) => {
    if (this.peers.has(socketId)) return;
    // The existing peer (us) waits for the newcomer to open the PC;
    // but we pre-create it so we're ready for their offer, and since
    // we don't addTrack-from-scratch here we won't negotiate first —
    // the newcomer's addTrack will fire negotiationneeded on their side.
    // However we DO addTrack our existing tracks below; that will also
    // fire negotiationneeded on our side. Perfect negotiation handles
    // the glare.
    this.createPeer(socketId, pubkey);
  };

  private handlePeerLeft = ({ socketId, pubkey }: { socketId: string; pubkey: string }) => {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    this.closePeer(peer);
    this.peers.delete(socketId);
  };

  private handleForceMute = ({ reason }: { reason?: string } = {}) => {
    this.mute();
    this.onForceMute?.(reason || 'A moderator muted you');
  };
  private handleForceCameraOff = ({ reason }: { reason?: string } = {}) => {
    this.stopCamera().catch(() => {});
    this.onForceCameraOff?.(reason || 'A moderator turned off your camera');
  };
  private handleForceScreenOff = ({ reason }: { reason?: string } = {}) => {
    this.stopScreenShare().catch(() => {});
    this.onForceScreenOff?.(reason || 'A moderator stopped your screen share');
  };

  private handleSignal = async ({ fromSocketId, fromPubkey, payload }: any) => {
    let peer = this.peers.get(fromSocketId);
    if (!peer) {
      // First message from a peer we didn't know about — create on demand.
      peer = this.createPeer(fromSocketId, fromPubkey);
    }

    try {
      if (payload.trackInfo) {
        const { trackId, type } = payload.trackInfo;
        peer.remoteTrackTypes.set(trackId, type);
        const pending = peer.pendingTracks.get(trackId);
        if (pending) {
          peer.pendingTracks.delete(trackId);
          this.attachRemoteTrack(peer, pending, type);
        }
        return;
      }

      if (payload.sdp) {
        const desc = payload.sdp as RTCSessionDescriptionInit;
        const offerCollision =
          desc.type === 'offer' &&
          (peer.makingOffer || peer.pc.signalingState !== 'stable');

        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;

        await peer.pc.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          await peer.pc.setLocalDescription();
          this.socket.emit('voice-signal', {
            toSocketId: fromSocketId,
            payload: { sdp: enhanceOpusSdp(peer.pc.localDescription) },
          });
        }
        return;
      }

      if (payload.ice) {
        try {
          await peer.pc.addIceCandidate(payload.ice);
        } catch (err) {
          if (!peer.ignoreOffer) console.warn('[voice] addIceCandidate failed:', err);
        }
      }
    } catch (err) {
      console.error('[voice] signal handling error:', err);
    }
  };

  private emitWithAck(event: string, data: any): Promise<any> {
    return new Promise((resolve) => {
      this.socket.emit(event, data, (response: any) => {
        resolve(response || {});
      });
    });
  }
}
