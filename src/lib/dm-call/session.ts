/**
 * One 1:1 DM call: local media, one mesh `Peer`, one throwaway-key signaling
 * channel.
 *
 * This is the mesh voice stack's `Peer` (simple-peer, perfect negotiation,
 * the `obelisk-control` data channel with its heartbeat) and quality presets,
 * without `VoiceClient`'s room machinery. A DM call has exactly two
 * participants who already found each other through the gift-wrapped invite,
 * so there is no roster, no presence beacon (nothing announces the call on a
 * relay), no membership gate and no SFU.
 *
 * ## Rendezvous
 *
 * Negotiation events are ephemeral, so both subscriptions must be live
 * before anything that matters is sent. The order is:
 *
 * 1. Caller subscribes to its throwaway key as soon as it rings (`listen()`),
 *    so its REQ is long live by the time anyone answers.
 * 2. Callee accepts: subscribes to its own key, waits for EOSE (`ready`),
 *    then says `hello` on the call relays — reliably, re-sent until acked.
 * 3. The caller learns the callee's key from that hello (or from the
 *    gift-wrapped accept, whichever lands first), and only then builds its
 *    `Peer` and offers. Both REQs are provably live at that point.
 *
 * Everything after that is re-sent until acknowledged (`CallSignalChannel`),
 * so a dropped event costs one re-send interval, not a connect timeout.
 *
 * Recovery: the caller is the impolite side (simple-peer initiator). If the
 * connection doesn't come up, or drops later, the caller rebuilds with a fresh
 * session and the callee follows the new offer (`onRemoteSessionChanged`),
 * the same recovery the mesh uses. Messages from a session either side has
 * torn down are dropped on both ends, so a late re-send can't pull the call
 * back to it.
 */

import { Peer, type PeerOptions } from '@/lib/voice/peer';
import { emptyVoiceMetrics } from '@/lib/voice/metrics';
import { getPreset, MIC_CONSTRAINTS } from '@/lib/voice/quality';
import type { VoiceSignalPayload, VoiceTrackKind } from '@/lib/voice/types';
import { getPublicKey } from 'nostr-tools';
import { CallSignalChannel, type CallPoolLike } from './signaling';

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

/** Rebuilds the caller attempts before a call that never connected gives up. */
const MAX_REBUILDS = 4;
/** How long a connected call may stay down before it is ended. */
const RECONNECT_GIVE_UP_MS = 30_000;
/** A call that hasn't connected this long after the rendezvous is given up. */
const CONNECT_DEADLINE_MS = 40_000;

function isOffer(payload: VoiceSignalPayload): boolean {
  if (payload.type === 'offer') return true;
  return payload.type === 'peer' && (payload.peerSignal as { type?: string } | undefined)?.type === 'offer';
}

function sessionId(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export class DmCallSession {
  private readonly opts: DmCallSessionOptions;
  private readonly channel: CallSignalChannel;
  readonly selfEph: string;
  private peer: Peer | null = null;
  /** Our `sessionId` on the current `Peer`, to purge its re-sends when dropped. */
  private peerSession: string | null = null;
  /** Newest offer seen from the other side: its message number and session. */
  private lastOffer: { id: number; session: string } | null = null;
  private listening = false;
  private building = false;
  private connectDeadline: ReturnType<typeof setTimeout> | null = null;
  private phase: DmCallPhase = 'connecting';
  private everConnected = false;
  private rebuilds = 0;
  private giveUpTimer: ReturnType<typeof setTimeout> | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private camTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private screenAudioTrack: MediaStreamTrack | null = null;
  private micOn = true;
  private facing: 'user' | 'environment' = 'user';
  private remote: Partial<Record<VoiceTrackKind, MediaStream>> = {};
  private remoteTrackKind = new Map<string, VoiceTrackKind>();
  private ended = false;

  constructor(opts: DmCallSessionOptions) {
    this.opts = opts;
    this.selfEph = getPublicKey(opts.selfSk);
    this.channel = new CallSignalChannel({
      relays: opts.relays,
      selfSk: opts.selfSk,
      callId: opts.callId,
      onSignal: (p, id) => this.onSignal(p, id),
      onHello: () => {
        if (this.opts.role !== 'caller' || this.ended) return;
        this.opts.onPeerJoined?.();
        void this.connectWhenReady();
      },
      pool: opts.pool,
    });
  }

  /** Acquire the mic (and camera for a video call). Call before `connect`. */
  async acquireMedia(): Promise<void> {
    const gum = this.opts.getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
    const stream = await gum({ audio: MIC_CONSTRAINTS });
    this.micTrack = stream.getAudioTracks()[0] ?? null;
    if (this.opts.video) {
      try {
        await this.startCamera();
      } catch (e) {
        // A call without a camera is still a call.
        console.warn('[dm-call] camera unavailable', e);
      }
    }
    this.emitMedia();
  }

  /**
   * Caller: subscribe to our throwaway key now, while it rings, so the REQ is
   * long live by the time the callee answers.
   */
  listen(): void {
    if (this.ended || this.listening) return;
    this.listening = true;
    this.channel.start();
  }

  /**
   * Caller: the gift-wrapped accept named the callee's key. Usually the
   * callee's hello on the call relay got here first; either one is enough.
   */
  peerAccepted(peerEph: string): void {
    if (this.ended) return;
    this.channel.setPeer(peerEph);
    void this.connectWhenReady();
  }

  /**
   * Callee: subscribe to our key, wait until the REQ is live, then say hello
   * and build the (polite) `Peer`. Resolves once the hello is queued.
   */
  async answer(callerEph: string): Promise<void> {
    if (this.ended) return;
    this.channel.setPeer(callerEph);
    this.listen();
    await this.channel.ready;
    if (this.ended) return;
    this.channel.sendHello();
    this.connect();
  }

  private async connectWhenReady(): Promise<void> {
    if (this.peer || this.building) return;
    this.building = true;
    try {
      await this.channel.ready;
    } finally {
      this.building = false;
    }
    this.connect();
  }

  /** Build the `Peer`, once the other side's key is known. */
  connect(): void {
    if (this.ended || this.peer || !this.channel.peer) return;
    if (!this.connectDeadline && !this.everConnected) {
      this.connectDeadline = setTimeout(() => {
        if (!this.everConnected) this.end('connect-failed');
      }, CONNECT_DEADLINE_MS);
    }
    this.buildPeer();
  }

  private buildPeer(): void {
    const channel = this.channel;
    const remote = channel.peer;
    if (!remote) return;
    const create = this.opts.createPeer ?? ((o: PeerOptions) => new Peer(o));
    const ownSession = sessionId();
    this.peerSession = ownSession;
    const peer = create({
      remotePubkey: remote,
      polite: this.opts.role === 'callee',
      sessionId: ownSession,
      iceTransportPolicy: this.opts.iceTransportPolicy,
      // Relay-only needs TURN allocation before the first candidate; give it
      // longer than a LAN mesh gets.
      connectTimeoutMs: this.opts.iceTransportPolicy === 'relay' ? 15_000 : 12_000,
      send: (payload) => channel.send(payload),
      control: { selfBuild: 'dm-call', metrics: emptyVoiceMetrics(), getCurrentPeers: () => [] },
      events: {
        onRemoteTrack: (track, _stream, kind) => this.addRemoteTrack(track, kind),
        onRemoteTrackEnded: (trackId) => this.removeRemoteTrack(trackId),
        onConnectionStateChange: () => {},
        onConnectionEstablished: () => this.onConnected(),
        onConnectionLost: () => this.onLost(),
        onPeerDead: (reason) => this.onPeerDead(peer, reason),
        onRemoteSessionChanged: (offer) => {
          if (this.peer !== peer) return;
          // The other side rebuilt; follow it with a fresh Peer of our own.
          this.dropPeer(false);
          this.buildPeer();
          void this.peer?.handleSignal(offer);
        },
      },
    });
    this.peer = peer;
    void this.attachLocalTracks(peer);
    if (this.opts.role === 'caller') void peer.kickInitialOffer();
  }

  private async attachLocalTracks(peer: Peer): Promise<void> {
    if (this.micTrack) await peer.setLocalTrack('audio', this.micTrack);
    if (this.camTrack) {
      await peer.setLocalTrack('camera', this.camTrack);
      const preset = getPreset('720p');
      await peer.setLocalVideoCap({ maxBitrate: preset.maxBitrate, maxFramerate: preset.maxFramerate });
    }
    if (this.screenTrack) await peer.setLocalTrack('screen', this.screenTrack);
    if (this.screenAudioTrack) await peer.setLocalTrack('screen-audio', this.screenAudioTrack);
  }

  private onSignal(payload: VoiceSignalPayload, id: number): void {
    if (this.ended) return;
    // Message numbers are monotonic per sender. Anything numbered before the
    // newest offer but belonging to another session is a late re-send from a
    // negotiation the other side already replaced — never let it through.
    if (this.lastOffer && id < this.lastOffer.id && payload.sessionId && payload.sessionId !== this.lastOffer.session) return;
    if (isOffer(payload) && payload.sessionId) {
      if (this.lastOffer && id < this.lastOffer.id) return;
      this.lastOffer = { id, session: payload.sessionId };
    }
    if (!this.peer) {
      // The callee builds on the first offer if it hasn't already.
      if (this.opts.role === 'callee') this.buildPeer();
      else return;
    }
    void this.peer?.handleSignal(payload);
  }

  private onConnected(): void {
    this.everConnected = true;
    this.rebuilds = 0;
    if (this.connectDeadline) {
      clearTimeout(this.connectDeadline);
      this.connectDeadline = null;
    }
    if (this.giveUpTimer) {
      clearTimeout(this.giveUpTimer);
      this.giveUpTimer = null;
    }
    this.setPhase('connected');
  }

  private onLost(): void {
    if (this.ended) return;
    this.setPhase('reconnecting');
    if (!this.giveUpTimer) {
      this.giveUpTimer = setTimeout(() => this.end('connection-lost'), RECONNECT_GIVE_UP_MS);
    }
  }

  private onPeerDead(peer: Peer, reason: string): void {
    if (this.ended || this.peer !== peer) return;
    if (reason.startsWith('bye:')) {
      this.end('remote-hangup');
      return;
    }
    if (reason === 'reset-requested') {
      // The other side is rebuilding; wait for its new offer.
      this.dropPeer(false);
      if (this.opts.role === 'caller') this.buildPeer();
      return;
    }
    // Open timeout / lost heartbeat. The caller drives the rebuild; the callee
    // asks for one and waits.
    if (this.opts.role === 'callee') {
      peer.requestReset();
      this.dropPeer(false);
      if (this.everConnected) this.onLost();
      return;
    }
    this.rebuilds++;
    if (!this.everConnected && this.rebuilds > MAX_REBUILDS) {
      this.end('connect-failed');
      return;
    }
    peer.requestReset();
    this.dropPeer(false);
    if (this.everConnected) this.onLost();
    this.buildPeer();
  }

  private dropPeer(notifyRemote: boolean): void {
    const peer = this.peer;
    this.peer = null;
    if (this.peerSession) this.channel.dropSession(this.peerSession);
    this.peerSession = null;
    peer?.close({ notifyRemote });
    this.remote = {};
    this.remoteTrackKind.clear();
    this.emitMedia();
  }

  private addRemoteTrack(track: MediaStreamTrack, kind: VoiceTrackKind): void {
    this.remoteTrackKind.set(track.id, kind);
    this.remote[kind] = new MediaStream([track]);
    this.emitMedia();
  }

  private removeRemoteTrack(trackId: string): void {
    const kind = this.remoteTrackKind.get(trackId);
    if (!kind) return;
    this.remoteTrackKind.delete(trackId);
    if (this.remote[kind]?.getTracks().some((t) => t.id === trackId)) delete this.remote[kind];
    this.emitMedia();
  }

  // -- controls ---------------------------------------------------------

  setMic(on: boolean): void {
    this.micOn = on;
    if (this.micTrack) this.micTrack.enabled = on;
    this.emitMedia();
  }

  private async startCamera(): Promise<void> {
    const gum = this.opts.getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
    const preset = getPreset('720p');
    const stream = await gum({ video: { ...preset.constraints, facingMode: this.facing } });
    this.camTrack = stream.getVideoTracks()[0] ?? null;
    if (this.camTrack) {
      try { this.camTrack.contentHint = 'motion'; } catch { /* older browsers */ }
    }
  }

  async setCamera(on: boolean): Promise<void> {
    if (on && !this.camTrack) {
      await this.startCamera();
      if (this.peer && this.camTrack) {
        await this.peer.setLocalTrack('camera', this.camTrack);
        const preset = getPreset('720p');
        await this.peer.setLocalVideoCap({ maxBitrate: preset.maxBitrate, maxFramerate: preset.maxFramerate });
      }
    } else if (!on && this.camTrack) {
      await this.peer?.setLocalTrack('camera', null);
      this.camTrack.stop();
      this.camTrack = null;
    }
    this.emitMedia();
  }

  /** Front / back camera on phones. No-op while the camera is off. */
  async flipCamera(): Promise<void> {
    if (!this.camTrack) return;
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    const old = this.camTrack;
    await this.startCamera();
    if (this.peer && this.camTrack) await this.peer.setLocalTrack('camera', this.camTrack);
    old.stop();
    this.emitMedia();
  }

  async setScreenShare(on: boolean): Promise<void> {
    if (on && !this.screenTrack) {
      const gdm = this.opts.getDisplayMedia ?? ((c) => navigator.mediaDevices.getDisplayMedia(c));
      const stream = await gdm({ video: true, audio: true });
      this.screenTrack = stream.getVideoTracks()[0] ?? null;
      this.screenAudioTrack = stream.getAudioTracks()[0] ?? null;
      // The browser's own "Stop sharing" bar ends the track without us.
      this.screenTrack?.addEventListener('ended', () => { void this.setScreenShare(false); }, { once: true });
      if (this.peer && this.screenTrack) await this.peer.setLocalTrack('screen', this.screenTrack);
      if (this.peer && this.screenAudioTrack) await this.peer.setLocalTrack('screen-audio', this.screenAudioTrack);
    } else if (!on && this.screenTrack) {
      await this.peer?.setLocalTrack('screen', null);
      if (this.screenAudioTrack) await this.peer?.setLocalTrack('screen-audio', null);
      this.screenTrack.stop();
      this.screenAudioTrack?.stop();
      this.screenTrack = null;
      this.screenAudioTrack = null;
    }
    this.emitMedia();
  }

  /** Hang up. Tells the other side over the call relay before closing. */
  hangup(): void {
    this.end('local-hangup', true);
  }

  end(reason: string, notifyRemote = false): void {
    if (this.ended) return;
    this.ended = true;
    if (this.giveUpTimer) clearTimeout(this.giveUpTimer);
    if (this.connectDeadline) clearTimeout(this.connectDeadline);
    const peer = this.peer;
    this.peer = null;
    peer?.close({ notifyRemote });
    // Give the bye a moment (and a re-send or two) before the sockets go.
    const channel = this.channel;
    setTimeout(() => channel.close(), notifyRemote ? 2500 : 0);
    for (const t of [this.micTrack, this.camTrack, this.screenTrack, this.screenAudioTrack]) t?.stop();
    this.micTrack = this.camTrack = this.screenTrack = this.screenAudioTrack = null;
    this.remote = {};
    this.emitMedia();
    this.setPhase('ended', reason);
  }

  private setPhase(phase: DmCallPhase, reason?: string): void {
    if (this.phase === phase && phase !== 'ended') return;
    this.phase = phase;
    this.opts.onPhase(phase, reason);
  }

  private localStreams = new Map<MediaStreamTrack, MediaStream>();

  /** One stable `MediaStream` per local track, so a `<video>` isn't re-bound on every emit. */
  private localStream(track: MediaStreamTrack | null): MediaStream | null {
    if (!track) return null;
    let stream = this.localStreams.get(track);
    if (!stream) {
      for (const t of this.localStreams.keys()) if (t.readyState === 'ended') this.localStreams.delete(t);
      stream = new MediaStream([track]);
      this.localStreams.set(track, stream);
    }
    return stream;
  }

  private remoteAudioStream: MediaStream | null = null;

  private emitMedia(): void {
    // Mic and shared-screen audio play through one element.
    const audioTracks = [...(this.remote.audio?.getTracks() ?? []), ...(this.remote['screen-audio']?.getTracks() ?? [])];
    const prev = this.remoteAudioStream?.getTracks() ?? [];
    if (audioTracks.length === 0) this.remoteAudioStream = null;
    else if (prev.length !== audioTracks.length || prev.some((t, i) => t !== audioTracks[i])) {
      this.remoteAudioStream = new MediaStream(audioTracks);
    }
    this.opts.onMedia({
      micOn: this.micOn,
      cameraOn: this.camTrack !== null,
      screenOn: this.screenTrack !== null,
      localVideo: this.localStream(this.camTrack),
      localScreen: this.localStream(this.screenTrack),
      remoteAudio: this.remoteAudioStream,
      remoteVideo: this.remote.camera ?? null,
      remoteScreen: this.remote.screen ?? null,
    });
  }
}
