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
import { SpeakingDetector } from './speaking-detector';
import { ServerToClient, ClientToServer } from '@/lib/socket-events';

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
  // Voice-activity detector for this peer's mic audio. Reads the track via
  // AnalyserNode without connecting to destination — playback stays on the
  // `<audio>` element so the OS keeps tagging the session as communication.
  speakingDetector: SpeakingDetector | null;
  // Locally silenced by the viewer only — independent from global deafen.
  locallyMuted: boolean;
  // Reconnection state. Both sides participate:
  //   impolite — drives ICE restart ladder, then hard reset.
  //   polite   — after a longer grace, emits { requestReset: true } so the
  //              impolite side does the recreate (avoids offer glare).
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  // Initial-connection watchdog — `scheduleReconnect` only fires on
  // `failed`/`disconnected`, but a handshake that never reaches `connected`
  // stays in `connecting`/`new` forever. This catches that gap.
  connectWatchdogTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

// Start small so transient ICE hiccups (WiFi roam, ~1–2s) self-heal without
// a visible gap, then back off to avoid hammering dead peers.
const RECONNECT_DELAYS_MS = [1500, 3000, 6000, 10000, 15000];
// Polite side waits longer — it's asking the remote to do a full PC rebuild,
// so we don't want to spam it.
const POLITE_RESET_DELAYS_MS = [8000, 12000, 20000];
// After this many ICE-restart attempts we escalate to a full PC recreate.
const ICE_RESTART_LIMIT = 3;
// Max time the initial handshake is allowed to sit before we treat it as
// wedged and trigger a fresh PC. Covers the "both need to leave and rejoin"
// case where the first offer/answer is lost or glare resolves badly.
const INITIAL_CONNECT_TIMEOUT_MS = 15000;

// User-tunable quality — read from localStorage so the Settings modal can change it.
export interface VoiceQualitySettings {
  cameraWidth: number;
  cameraHeight: number;
  cameraFps: number;
  cameraMaxBitrate: number;
  screenFps: number;
  screenMaxBitrate: number;
  /**
   * When true (default), we acquire the mic eagerly on join so the browser
   * tags this as a "communication" audio session. That's what triggers the
   * OS-level auto-ducking of music/video from other apps and tabs. Turn
   * off if you'd rather keep background audio at full volume — at the cost
   * of possibly having remote voices show up in the OS media mixer rather
   * than the call/communication category.
   */
  duckOtherAudio: boolean;
}
const VOICE_QUALITY_DEFAULTS: VoiceQualitySettings = {
  cameraWidth: 1920,
  cameraHeight: 1080,
  cameraFps: 60,
  cameraMaxBitrate: 8_000_000,
  screenFps: 60,
  screenMaxBitrate: 25_000_000,
  duckOtherAudio: true,
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
    maxaveragebitrate: '256000',
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
  private localPubkey: string | null = null;
  private localSpeakingDetector: SpeakingDetector | null = null;

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
  // Fires on real audio-level transitions (RMS + hangover via SpeakingDetector).
  // Wire this to the voice store's `setSpeaking` so the green orb reflects
  // actual speech, not just mute state.
  onSpeakingChange?: (pubkey: string, speaking: boolean) => void;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  // ── Join / Leave ─────────────────────────────────────────────

  async join(channelId: string, localPubkey: string): Promise<void> {
    this.channelId = channelId;
    this.localPubkey = localPubkey;
    this.mySocketId = this.socket.id || null;

    // Start muted, but eagerly try to acquire the mic so the browser tags
    // this session as "communication" instead of "media". Without a local
    // mic track, Chrome/Firefox classify the remote audio elements as
    // playback/media — which surfaces remote peers' voices in the OS media
    // mixer, hijacks media keys, and makes the call sound like background
    // music. The track stays disabled (enabled=false) while isMuted so no
    // audio is actually sent until the user unmutes. If mic acquisition
    // fails (insecure origin, permission denied, no device), we fall
    // through silently — the user can still hear everyone else.
    this.isMuted = true;
    // When the "Duck other audio" setting is ON (default) we acquire the mic
    // eagerly so the browser tags this as a communication session; the OS
    // then auto-ducks music/video from other apps. When the user opts out,
    // we defer acquisition until unmute — other apps stay at full volume.
    if (getVoiceQuality().duckOtherAudio) {
      try {
        await this.enableMic();
      } catch (err) {
        console.warn('[voice] mic unavailable at join; joining without local audio:', err);
      }
    }

    this.socket.on(ServerToClient.VoicePeerJoined, this.handlePeerJoined);
    this.socket.on(ServerToClient.VoicePeerLeft, this.handlePeerLeft);
    this.socket.on(ServerToClient.VoiceSignal, this.handleSignal);
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

    if (this.localSpeakingDetector) {
      this.localSpeakingDetector.stop();
      this.localSpeakingDetector = null;
      // Clear the local user's orb on their own UI too.
      if (this.localPubkey) this.onSpeakingChange?.(this.localPubkey, false);
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
      this.audioTrack = null;
    }

    if (this.channelId) {
      this.socket.emit(ClientToServer.LeaveVoice, this.channelId);
    }
    this.channelId = null;
    this.localPubkey = null;
    this.onConnectionStateChange?.('disconnected');
  }

  destroy(): void { this.leave(); }

  // ── Audio controls ───────────────────────────────────────────

  mute(): void {
    this.isMuted = true;
    if (this.audioTrack) this.audioTrack.enabled = false;
  }

  async unmute(): Promise<void> {
    this.isMuted = false;
    if (!this.audioTrack) {
      await this.enableMic();
      return;
    }
    this.audioTrack.enabled = true;
  }

  /**
   * Acquire the mic and attach it to every existing peer. Safe to call
   * multiple times — no-ops if the track already exists. Throws a
   * user-facing Error on insecure origin or permission denial so the
   * caller can surface it via onError / UI toast.
   */
  async enableMic(): Promise<void> {
    if (this.audioTrack) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        typeof window !== 'undefined' && window.isSecureContext
          ? 'Microphone is not supported on this device'
          : 'Microphone requires a secure context (HTTPS or localhost)',
      );
    }
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
    if (!this.audioTrack) return;
    this.audioTrack.contentHint = 'speech';
    this.audioTrack.enabled = !this.isMuted;

    // Local voice-activity detection — drives the viewer's own green orb
    // without a round-trip through remote peers. Detector reads the mic via
    // AnalyserNode only (never connects to destination), so playback stays
    // purely on the outbound sender. A muted track produces silence → RMS 0
    // → detector correctly reports not-speaking, so muted users don't blink.
    if (this.localPubkey && !this.localSpeakingDetector) {
      const pubkey = this.localPubkey;
      this.localSpeakingDetector = new SpeakingDetector(
        new MediaStream([this.audioTrack]),
        (s) => this.onSpeakingChange?.(pubkey, s),
      );
      this.localSpeakingDetector.start();
    }

    // Attach to every existing peer; renegotiation fires automatically.
    for (const peer of this.peers.values()) {
      if (peer.senders.audio) continue;
      this.sendTrackInfo(peer, this.audioTrack.id, 'audio');
      const s = peer.pc.addTrack(this.audioTrack, this.audioStream);
      peer.senders.audio = s;
      this.tuneAudioSender(s);
    }
  }

  setDeafened(deafened: boolean): void {
    this.isDeafened = deafened;
    for (const peer of this.peers.values()) {
      this.applyPeerVolume(peer);
      // Video elements have no audio track of their own — we still clear
      // the element-level `muted` for symmetry with the old behavior.
      if (peer.cameraElement) peer.cameraElement.muted = deafened;
      if (peer.screenElement) peer.screenElement.muted = deafened;
    }
  }

  /**
   * Silence a specific remote peer for the local viewer only — does NOT
   * affect other participants and never hits the server. Used by the
   * per-tile "mute for me" button in the voice UI.
   */
  setPeerMuted(pubkey: string, muted: boolean): void {
    for (const peer of this.peers.values()) {
      if (peer.pubkey !== pubkey) continue;
      peer.locallyMuted = muted;
      this.applyPeerVolume(peer);
    }
  }

  private applyPeerVolume(peer: PeerConn): void {
    const silent = this.isDeafened || peer.locallyMuted;
    if (peer.audioElement) peer.audioElement.muted = silent;
    if (peer.screenAudioElement) peer.screenAudioElement.muted = silent;
  }

  // ── Camera ───────────────────────────────────────────────────

  async startCamera(): Promise<void> {
    if (this.cameraStream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera is not supported on this device');
    }
    const q = getVoiceQuality();
    let claimed = false;
    if (this.channelId) {
      const claim = await this.emitWithAck('voice-camera-claim', this.channelId);
      if (claim?.error) throw new Error(claim.error);
      claimed = true;
    }
    // Acquire the camera with a fallback. "Timeout starting video source" and
    // similar transient failures (NotReadableError / AbortError) fire when
    // another process is releasing the device or the OS-level camera pipeline
    // hasn't settled. Retry once with a brief delay, then relax constraints.
    const primary = {
      video: {
        width: { ideal: q.cameraWidth },
        height: { ideal: q.cameraHeight },
        frameRate: { ideal: q.cameraFps, max: q.cameraFps },
      },
      audio: false,
    } as const;
    const fallback = { video: true, audio: false } as const;
    try {
      try {
        this.cameraStream = await navigator.mediaDevices.getUserMedia(primary);
      } catch (err) {
        const name = (err as Error)?.name;
        const msg = (err as Error)?.message || '';
        const transient = name === 'NotReadableError'
          || name === 'AbortError'
          || /Timeout starting video source/i.test(msg);
        if (!transient) throw err;
        await new Promise((r) => setTimeout(r, 600));
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia(primary);
        } catch {
          // Last-ditch: let the browser pick any working camera config.
          this.cameraStream = await navigator.mediaDevices.getUserMedia(fallback);
        }
      }
    } catch (err) {
      // Release the server-side seat we reserved, otherwise the user would
      // appear to be "using the camera" until the whole voice session ends.
      if (claimed && this.channelId) {
        try { this.socket.emit(ClientToServer.VoiceCameraRelease, this.channelId); } catch {}
      }
      throw err;
    }
    this.cameraTrack = this.cameraStream.getVideoTracks()[0] || null;
    // Stamp what we asked for so `applyLiveQualitySettings` can detect a
    // subsequent change and restart the track.
    this.appliedCameraW = q.cameraWidth;
    this.appliedCameraH = q.cameraHeight;
    this.appliedCameraFps = q.cameraFps;
    this.onLocalCameraStream?.(this.cameraStream);

    if (this.cameraTrack) {
      for (const peer of this.peers.values()) {
        this.sendTrackInfo(peer, this.cameraTrack.id, 'camera');
        const sender = peer.pc.addTrack(this.cameraTrack, this.cameraStream);
        peer.senders.camera = sender;
        this.tuneVideoSender(sender, q.cameraMaxBitrate, q.cameraFps, 'maintain-resolution',
          { minBitrate: 2_000_000, priority: 'high' });
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
      this.socket.emit(ClientToServer.VoiceCameraRelease, this.channelId);
    }
  }

  // ── Screen Share ─────────────────────────────────────────────

  async startScreenShare(): Promise<void> {
    if (this.screenStream) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing is not supported on this device');
    }
    // Ask the server for exclusive screen-share rights first.
    let claimed = false;
    if (this.channelId) {
      const claim = await this.emitWithAck('voice-screen-claim', this.channelId);
      if (claim?.error) {
        throw new Error(claim.error);
      }
      claimed = true;
    }
    const q = getVoiceQuality();
    try {
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
    } catch (err) {
      // User canceled the picker, or the OS failed to hand over a display
      // source. Either way, release the server seat so another user (or we
      // ourselves on the next attempt) can claim it.
      if (claimed && this.channelId) {
        try { this.socket.emit(ClientToServer.VoiceScreenRelease, this.channelId); } catch {}
      }
      throw err;
    }
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
        this.tuneVideoSender(sender, q.screenMaxBitrate, q.screenFps, 'maintain-resolution',
          { minBitrate: 5_000_000, priority: 'high' });
      }
    }
    if (this.screenAudioTrack) {
      for (const peer of this.peers.values()) {
        this.sendTrackInfo(peer, this.screenAudioTrack.id, 'screen-audio');
        const sender = peer.pc.addTrack(this.screenAudioTrack, this.screenStream);
        peer.senders['screen-audio'] = sender;
        // Tab/system audio defaults to ~32 kbps mono — fine for voice, terrible
        // for music or video soundtracks. Bump to 320 kbps.
        this.tuneAudioSender(sender, 320_000);
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
      this.socket.emit(ClientToServer.VoiceScreenRelease, this.channelId);
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
      speakingDetector: null,
      locallyMuted: false,
      reconnectTimer: null,
      reconnectAttempts: 0,
      connectWatchdogTimer: null,
      closed: false,
    };

    // Arm the initial-connection watchdog. If we never reach `connected`
    // within the timeout the handshake is wedged (lost first offer, bad
    // glare resolution, renegotiation triggered by a setting change that
    // stalled). Trigger recovery proactively instead of waiting forever
    // for the user to leave and rejoin.
    peer.connectWatchdogTimer = setTimeout(() => {
      peer.connectWatchdogTimer = null;
      if (peer.closed) return;
      if (peer.pc.connectionState === 'connected') return;
      console.warn('[voice] initial connect timeout for', remotePubkey.slice(0, 8),
        '— state:', peer.pc.connectionState);
      if (peer.polite) {
        this.socket.emit(ServerToClient.VoiceSignal, {
          toSocketId: peer.socketId,
          payload: { requestReset: true },
        });
      } else {
        this.performHardReset(peer);
      }
    }, INITIAL_CONNECT_TIMEOUT_MS);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket.emit(ServerToClient.VoiceSignal, {
          toSocketId: remoteSocketId,
          payload: { ice: candidate.toJSON() },
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.socket.emit(ServerToClient.VoiceSignal, {
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
      let type = peer.remoteTrackTypes.get(track.id);
      if (!type) {
        // Fallback: on mid-session renegotiation (e.g. peer turns on camera
        // after we're already connected), the remote track id delivered by
        // ontrack can differ from the sender-side id we received via
        // trackInfo. Match by kind against any unattached expected type.
        type = this.findUnattachedTrackType(peer, track.kind as 'audio' | 'video');
      }
      if (type) {
        this.attachRemoteTrack(peer, track, type);
      } else {
        peer.pendingTracks.set(track.id, track);
      }
    };

    const clearRecoveryTimers = () => {
      peer.reconnectAttempts = 0;
      if (peer.reconnectTimer) {
        clearTimeout(peer.reconnectTimer);
        peer.reconnectTimer = null;
      }
      if (peer.connectWatchdogTimer) {
        clearTimeout(peer.connectWatchdogTimer);
        peer.connectWatchdogTimer = null;
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[voice] peer', remotePubkey.slice(0, 8), 'connection:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        clearRecoveryTimers();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.scheduleReconnect(peer);
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log('[voice] peer', remotePubkey.slice(0, 8), 'ice:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        clearRecoveryTimers();
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        this.scheduleReconnect(peer);
      }
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
      this.tuneVideoSender(s, q.cameraMaxBitrate, q.cameraFps, 'maintain-resolution',
        { minBitrate: 2_000_000, priority: 'high' });
    }
    if (this.screenTrack && this.screenStream) {
      const q = getVoiceQuality();
      this.sendTrackInfo(peer, this.screenTrack.id, 'screen');
      const s = pc.addTrack(this.screenTrack, this.screenStream);
      peer.senders.screen = s;
      this.tuneVideoSender(s, q.screenMaxBitrate, q.screenFps, 'maintain-resolution',
        { minBitrate: 5_000_000, priority: 'high' });
    }
    if (this.screenAudioTrack && this.screenStream) {
      this.sendTrackInfo(peer, this.screenAudioTrack.id, 'screen-audio');
      const s = pc.addTrack(this.screenAudioTrack, this.screenStream);
      peer.senders['screen-audio'] = s;
      this.tuneAudioSender(s, 320_000);
    }

    this.peers.set(remoteSocketId, peer);
    return peer;
  }

  private closePeer(peer: PeerConn): void {
    peer.closed = true;
    if (peer.reconnectTimer) {
      clearTimeout(peer.reconnectTimer);
      peer.reconnectTimer = null;
    }
    if (peer.connectWatchdogTimer) {
      clearTimeout(peer.connectWatchdogTimer);
      peer.connectWatchdogTimer = null;
    }
    if (peer.speakingDetector) {
      peer.speakingDetector.stop();
      peer.speakingDetector = null;
      // Clear any lingering "speaking" state for this peer so the UI orb
      // doesn't stay lit after they drop.
      this.onSpeakingChange?.(peer.pubkey, false);
    }
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

  // ── Reconnection ─────────────────────────────────────────────
  //
  // ICE drops for lots of reasons (WiFi roam, NAT rebinding, uplink loss,
  // renegotiation stalling when a peer flips a setting that restarts tracks).
  // RTCPeerConnection doesn't self-heal, so we drive recovery here.
  //
  // Impolite side leads: cheap ICE restart (preserves tracks) up to
  // ICE_RESTART_LIMIT, then a full PC recreate.
  //
  // Polite side used to be passive and would sit in `failed`/`disconnected`
  // forever. It now joins in after a longer grace, emitting
  // `{ requestReset: true }` so the impolite peer does the recreate —
  // handled in `handleSignal`. Only impolite ever drives offers, so no
  // glare.

  private scheduleReconnect(peer: PeerConn): void {
    if (peer.closed) return;
    if (peer.reconnectTimer) return;
    if (peer.pc.connectionState === 'connected') return;

    const delays = peer.polite ? POLITE_RESET_DELAYS_MS : RECONNECT_DELAYS_MS;
    const delay = delays[Math.min(peer.reconnectAttempts, delays.length - 1)];
    peer.reconnectTimer = setTimeout(() => {
      peer.reconnectTimer = null;
      if (peer.closed) return;
      const state = peer.pc.connectionState;
      if (state === 'connected') {
        peer.reconnectAttempts = 0;
        return;
      }
      peer.reconnectAttempts += 1;
      if (peer.polite) {
        this.requestRemoteReset(peer);
      } else if (peer.reconnectAttempts <= ICE_RESTART_LIMIT) {
        this.performIceRestart(peer);
      } else {
        this.performHardReset(peer);
      }
      // Check again later — if this attempt doesn't land, try again.
      this.scheduleReconnect(peer);
    }, delay);
  }

  private requestRemoteReset(peer: PeerConn): void {
    console.log('[voice] requesting remote reset from', peer.pubkey.slice(0, 8),
      'attempt', peer.reconnectAttempts);
    this.socket.emit(ServerToClient.VoiceSignal, {
      toSocketId: peer.socketId,
      payload: { requestReset: true },
    });
  }

  private performIceRestart(peer: PeerConn): void {
    console.log('[voice] ICE restart for', peer.pubkey.slice(0, 8),
      'attempt', peer.reconnectAttempts);
    try {
      // restartIce triggers onnegotiationneeded, which re-sends an offer
      // with fresh ICE credentials through our existing signaling path.
      peer.pc.restartIce();
    } catch (err) {
      console.warn('[voice] restartIce failed:', err);
    }
  }

  private performHardReset(peer: PeerConn): void {
    console.log('[voice] hard reset for', peer.pubkey.slice(0, 8));
    // Tell the remote side to tear down and rebuild too, otherwise they'd
    // keep feeding offers to our dead PC.
    this.socket.emit(ServerToClient.VoiceSignal, {
      toSocketId: peer.socketId,
      payload: { reset: true },
    });
    this.recreatePeer(peer);
  }

  private recreatePeer(peer: PeerConn): void {
    const { socketId, pubkey } = peer;
    this.closePeer(peer);
    this.peers.delete(socketId);
    // createPeer re-attaches local tracks; impolite side's addTrack will
    // fire onnegotiationneeded and drive a fresh offer.
    this.createPeer(socketId, pubkey);
  }

  private findUnattachedTrackType(
    peer: PeerConn,
    kind: 'audio' | 'video',
  ): TrackType | undefined {
    const candidates: Set<TrackType> = kind === 'video'
      ? new Set(['camera', 'screen'])
      : new Set(['audio', 'screen-audio']);
    const attached = new Set<TrackType>();
    if (peer.audioElement) attached.add('audio');
    if (peer.screenAudioElement) attached.add('screen-audio');
    if (peer.cameraElement) attached.add('camera');
    if (peer.screenElement) attached.add('screen');
    // Walk announced types newest-first: when a peer enables screenshare
    // while camera is already live, the new `screen` trackInfo lands after
    // the old `camera` entry. Matching oldest-first would route the incoming
    // screen track as "camera already attached → no slot", leaving the
    // screen video stuck in pendingTracks until a trackInfo resolves it by
    // kind. Newest-first resolves screen immediately against its own slot.
    const announced = [...peer.remoteTrackTypes.values()].reverse();
    for (const type of announced) {
      if (candidates.has(type) && !attached.has(type)) return type;
    }
    return undefined;
  }

  /**
   * Sweep pendingTracks and attach anything we can now place. Safe to call
   * repeatedly — it's a no-op when nothing is pending or no slot is free.
   * Called after SDP is applied and after trackInfo arrives, so a track
   * that raced ahead of its announcement gets picked up as soon as the
   * other side of the race catches up.
   */
  private reconcilePendingTracks(peer: PeerConn): void {
    if (peer.pendingTracks.size === 0) return;
    for (const [pid, ptrack] of [...peer.pendingTracks]) {
      const type = this.findUnattachedTrackType(peer, ptrack.kind as 'audio' | 'video');
      if (!type) continue;
      peer.pendingTracks.delete(pid);
      this.attachRemoteTrack(peer, ptrack, type);
    }
  }

  /**
   * Drop stale `remoteTrackTypes` entries of a given type. Entries are keyed
   * by the *sender-side* track id, so we can't evict a specific one from the
   * receiver — but a peer can only publish one track of each TrackType at a
   * time, so any leftover entry of the same type is necessarily stale.
   */
  private evictTrackTypeEntries(peer: PeerConn, type: TrackType): void {
    for (const [tid, t] of [...peer.remoteTrackTypes]) {
      if (t === type) peer.remoteTrackTypes.delete(tid);
    }
  }

  private attachRemoteTrack(peer: PeerConn, track: MediaStreamTrack, type: TrackType): void {
    const stream = new MediaStream([track]);

    if (type === 'audio' || type === 'screen-audio') {
      // Attach to DOM for reliable autoplay in Chromium/Safari.
      const el = document.createElement('audio');
      el.srcObject = stream;
      el.autoplay = true;
      // Respect both global deafen and any per-peer local mute already set.
      el.muted = this.isDeafened || peer.locallyMuted;
      (el as any).playsInline = true;
      el.style.display = 'none';
      document.body.appendChild(el);
      el.play().catch((err) => {
        console.warn('[voice] audio play() blocked — will retry on user gesture:', err);
      });
      if (type === 'audio') {
        // Replace any prior audio element cleanly so it doesn't linger in
        // the DOM with a live MediaStream (double-audio / memory leak).
        if (peer.audioElement && peer.audioElement !== el) {
          try { peer.audioElement.pause(); } catch {}
          peer.audioElement.srcObject = null;
          peer.audioElement.remove();
        }
        peer.audioElement = el;
        // Start per-peer voice-activity detection on the mic track only.
        // Using a fresh MediaStream wrapping the same track means the
        // analyser consumes the track in a separate AudioContext node —
        // the `<audio>` element's playback is untouched, so the OS still
        // classifies this session as communication (not background media).
        if (peer.speakingDetector) peer.speakingDetector.stop();
        peer.speakingDetector = new SpeakingDetector(
          new MediaStream([track]),
          (s) => this.onSpeakingChange?.(peer.pubkey, s),
        );
        peer.speakingDetector.start();
      } else {
        if (peer.screenAudioElement && peer.screenAudioElement !== el) {
          try { peer.screenAudioElement.pause(); } catch {}
          peer.screenAudioElement.srcObject = null;
          peer.screenAudioElement.remove();
        }
        peer.screenAudioElement = el;
      }
      return;
    }

    const videoEl = document.createElement('video');
    videoEl.srcObject = stream;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;

    const clearSlotForThisTrack = () => {
      if (type === 'camera' && peer.cameraElement === videoEl) {
        peer.cameraElement = null;
        this.evictTrackTypeEntries(peer, 'camera');
        this.onRemoteVideoElement?.(peer.pubkey, null);
      } else if (type === 'screen' && peer.screenElement === videoEl) {
        peer.screenElement = null;
        this.evictTrackTypeEntries(peer, 'screen');
        this.onRemoteScreenElement?.(peer.pubkey, null);
      }
    };
    track.onended = clearSlotForThisTrack;
    // Sender removed/replaced the track — browsers surface this as `mute`.
    track.onmute = clearSlotForThisTrack;

    if (type === 'camera') {
      if (peer.cameraElement && peer.cameraElement !== videoEl) {
        try { peer.cameraElement.pause(); } catch {}
        peer.cameraElement.srcObject = null;
        // Force UI to unmount the stale <video> before mounting the new
        // one — otherwise a component memoized on element identity may
        // keep the old node.
        this.onRemoteVideoElement?.(peer.pubkey, null);
      }
      peer.cameraElement = videoEl;
      this.onRemoteVideoElement?.(peer.pubkey, videoEl);
    } else {
      if (peer.screenElement && peer.screenElement !== videoEl) {
        try { peer.screenElement.pause(); } catch {}
        peer.screenElement.srcObject = null;
        this.onRemoteScreenElement?.(peer.pubkey, null);
      }
      peer.screenElement = videoEl;
      this.onRemoteScreenElement?.(peer.pubkey, videoEl);
    }
  }

  private sendTrackInfo(peer: PeerConn, trackId: string, type: TrackType): void {
    this.socket.emit(ServerToClient.VoiceSignal, {
      toSocketId: peer.socketId,
      payload: { trackInfo: { trackId, type } },
    });
  }

  /**
   * Re-read the user's voice-quality settings and push them to every active
   * sender. Bitrate + framerate + priority changes apply live via
   * setParameters (no re-negotiation). If the camera resolution has changed,
   * restart the camera track so the new `getUserMedia` constraints take
   * effect — this briefly stops & starts the outbound video, but mic and
   * remote tracks stay up and the call isn't dropped.
   *
   * Called from the Settings panel after the user flips any quality option,
   * so changes are immediate instead of "takes effect next time."
   */
  async applyLiveQualitySettings(): Promise<void> {
    const q = getVoiceQuality();

    // 1. Bitrate / framerate / priority — cheap, no renegotiation.
    for (const peer of this.peers.values()) {
      if (peer.senders.camera) {
        this.tuneVideoSender(peer.senders.camera, q.cameraMaxBitrate, q.cameraFps,
          'maintain-resolution', { minBitrate: 2_000_000, priority: 'high' });
      }
      if (peer.senders.screen) {
        this.tuneVideoSender(peer.senders.screen, q.screenMaxBitrate, q.screenFps,
          'maintain-resolution', { minBitrate: 5_000_000, priority: 'high' });
      }
    }

    // 2. Camera resolution / framerate change — requires a track restart
    // because `getUserMedia` constraints aren't mutable on an existing
    // track in all browsers. Track this.appliedCameraW/H/Fps explicitly
    // rather than asking the track for its negotiated values, since those
    // don't always match what was requested (e.g. camera returned 1280
    // instead of our 1920 ask). Comparing against the LAST APPLIED target
    // avoids restart loops.
    if (this.cameraTrack && this.cameraStream) {
      const stale =
        this.appliedCameraW !== q.cameraWidth ||
        this.appliedCameraH !== q.cameraHeight ||
        this.appliedCameraFps !== q.cameraFps;
      if (stale) {
        try {
          await this.stopCamera();
          await this.startCamera();
        } catch (err) {
          console.warn('[voice] camera restart after settings change failed:', err);
        }
      }
    }
  }

  // Last settings applied when the camera track was acquired — used by
  // `applyLiveQualitySettings` to know whether a restart is actually needed.
  private appliedCameraW: number | null = null;
  private appliedCameraH: number | null = null;
  private appliedCameraFps: number | null = null;

  private tuneVideoSender(
    sender: RTCRtpSender,
    maxBitrate: number,
    maxFramerate: number,
    degradationPreference: RTCDegradationPreference = 'maintain-framerate',
    opts: { minBitrate?: number; priority?: RTCPriorityType } = {},
  ): void {
    try {
      const params = sender.getParameters() as RTCRtpSendParameters & {
        degradationPreference?: RTCDegradationPreference;
      };
      params.encodings = params.encodings && params.encodings.length > 0
        ? params.encodings
        : [{}];
      const enc = params.encodings[0] as RTCRtpEncodingParameters & {
        maxFramerate?: number;
        minBitrate?: number;
        networkPriority?: RTCPriorityType;
      };
      enc.maxBitrate = maxBitrate;
      enc.maxFramerate = maxFramerate;
      // `minBitrate` is advisory — browsers may ignore under real congestion,
      // but it prevents the bandwidth estimator from starving video down to a
      // slideshow when there's no actual network pressure.
      if (opts.minBitrate !== undefined) enc.minBitrate = opts.minBitrate;
      if (opts.priority !== undefined) {
        enc.priority = opts.priority;
        enc.networkPriority = opts.priority;
      }
      params.degradationPreference = degradationPreference;
      sender.setParameters(params).catch((err) => {
        console.warn('[voice] setParameters failed:', err);
      });
    } catch (err) {
      console.warn('[voice] getParameters failed:', err);
    }
  }

  private tuneAudioSender(sender: RTCRtpSender, maxBitrate = 256_000): void {
    try {
      const params = sender.getParameters();
      params.encodings = params.encodings && params.encodings.length > 0
        ? params.encodings
        : [{}];
      const enc = params.encodings[0] as RTCRtpEncodingParameters & {
        networkPriority?: RTCPriorityType;
      };
      enc.maxBitrate = maxBitrate;
      enc.priority = 'high';
      enc.networkPriority = 'high';
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
      if (payload.reset) {
        // Remote side hit its recreate threshold. Tear down and rebuild our
        // PC so their fresh offer lands on a clean slate. We intentionally
        // do not echo the reset back — the remote already recreated theirs.
        const { socketId, pubkey } = peer;
        this.closePeer(peer);
        this.peers.delete(socketId);
        this.createPeer(socketId, pubkey);
        return;
      }

      if (payload.requestReset) {
        // A stuck polite peer is asking us to drive the recreate. Only the
        // impolite side should honor this — otherwise two polite sides in an
        // edge-case topology would recreate simultaneously.
        if (!peer.polite) this.performHardReset(peer);
        return;
      }

      if (payload.trackInfo) {
        const { trackId, type } = payload.trackInfo;
        peer.remoteTrackTypes.set(trackId, type);
        let pending = peer.pendingTracks.get(trackId);
        if (!pending) {
          // Track id mismatch fallback: drain a pending track of matching kind.
          const wantKind = (type === 'audio' || type === 'screen-audio') ? 'audio' : 'video';
          for (const [pid, ptrack] of peer.pendingTracks) {
            if (ptrack.kind === wantKind) {
              pending = ptrack;
              peer.pendingTracks.delete(pid);
              break;
            }
          }
        } else {
          peer.pendingTracks.delete(trackId);
        }
        if (pending) this.attachRemoteTrack(peer, pending, type);
        // Other tracks may have raced ahead of their own trackInfo — now
        // that the announced-types set has grown, try to place them too.
        this.reconcilePendingTracks(peer);
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
          this.socket.emit(ServerToClient.VoiceSignal, {
            toSocketId: fromSocketId,
            payload: { sdp: enhanceOpusSdp(peer.pc.localDescription) },
          });
        }
        // Renegotiation often delivers a fresh track plus its trackInfo in
        // either order — sweep after SDP so anything that raced gets placed.
        this.reconcilePendingTracks(peer);
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
