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
 * Who offers: the caller is the impolite side (simple-peer initiator), and
 * only builds its `Peer` once the callee's `accept` arrives — the callee opens
 * its signaling subscription *before* sending that accept, so the caller's
 * first offer has somewhere to land. If the connection doesn't come up, or
 * drops later, the caller rebuilds with a fresh session and the callee follows
 * the new offer (`onRemoteSessionChanged`), the same recovery the mesh uses.
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

function sessionId(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export class DmCallSession {
  private readonly opts: DmCallSessionOptions;
  private channel: CallSignalChannel | null = null;
  private peerEph: string | null = null;
  readonly selfEph: string;
  private peer: Peer | null = null;
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
   * Open the signaling subscription to the other side's throwaway key. The
   * callee does this before sending its accept; the caller when the accept
   * arrives (it only learns the key then).
   */
  openSignaling(peerEph: string): void {
    if (this.ended || this.channel) return;
    this.peerEph = peerEph;
    this.channel = new CallSignalChannel({
      relays: this.opts.relays,
      selfSk: this.opts.selfSk,
      peerEph,
      callId: this.opts.callId,
      onSignal: (p) => this.onSignal(p),
      pool: this.opts.pool,
    });
    this.channel.start();
  }

  /** Build the `Peer`. Needs `openSignaling` first. */
  connect(): void {
    if (this.ended || this.peer || !this.channel) return;
    this.buildPeer();
  }

  private buildPeer(): void {
    const channel = this.channel;
    if (!channel || !this.peerEph) return;
    const create = this.opts.createPeer ?? ((o: PeerOptions) => new Peer(o));
    const peer = create({
      remotePubkey: this.peerEph,
      polite: this.opts.role === 'callee',
      sessionId: sessionId(),
      iceTransportPolicy: this.opts.iceTransportPolicy,
      // Relay-only needs TURN allocation before the first candidate; give it
      // longer than a LAN mesh gets.
      connectTimeoutMs: this.opts.iceTransportPolicy === 'relay' ? 15_000 : 12_000,
      send: (payload) => channel.send(payload).catch((e) => console.warn('[dm-call] signal publish failed', e)),
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

  private onSignal(payload: VoiceSignalPayload): void {
    if (this.ended) return;
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
    const peer = this.peer;
    this.peer = null;
    peer?.close({ notifyRemote });
    // Give the bye a moment to leave before the sockets go.
    const channel = this.channel;
    setTimeout(() => channel?.close(), notifyRemote ? 1500 : 0);
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
