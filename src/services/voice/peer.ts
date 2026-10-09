/**
 * Pairwise WebRTC connection backed by simple-peer.
 *
 * Obelisk still owns Nostr identity, admission, relay signaling, mesh
 * discovery, media policy, and quality controls. simple-peer owns the
 * browser-specific SDP/ICE/renegotiation state machine and data channel.
 *
 * The work beside the negotiation is delegated: `PeerControlChannel`
 * (`peer-control.ts`) runs the `obelisk-control` data channel with its
 * heartbeat, `PeerRemoteTracks` (`peer-remote-tracks.ts`) keeps what the
 * remote announced about its tracks, `peer-sender-params.ts` applies the
 * encoder caps, `peer-wrtc.ts` supplies the WebRTC constructors.
 */
import type SimplePeer from 'simple-peer';
import type { VoiceSignalPayload, VoiceTrackKind, VoiceQualityHint } from '@/types/voice/protocol';
import { startStatsMonitor, type StatsMonitorHandle } from './stats';
import { ICE_TRANSPORT_POLICY } from './ice-config';
import type { PeerEvents, PeerOptions } from '@/types/voice/peer';
import { feedSimplePeer, newSimplePeer } from './peer-wrtc';
import { PeerControlChannel, decodeControl } from './peer-control';
import { PeerRemoteTracks } from './peer-remote-tracks';
import { PeerSessionBinding } from './peer-session-binding';
import { applyAudioSenderParams, applyVideoSenderParams, type VideoCap } from './peer-sender-params';
import type { ControlMessage } from '@/types/voice/control-channel';
import { INITIAL_CONNECT_TIMEOUT_MS } from '@/constants/voice/peer';

export type { PeerEvents, PeerOptions } from '@/types/voice/peer';
export { REMOTE_VIDEO_MUTE_GRACE_MS } from '@/constants/voice/peer-remote-tracks';

type SimplePeerInstance = SimplePeer.Instance;

interface LocalMedia {
  track: MediaStreamTrack;
  stream: MediaStream;
}

export class Peer {
  readonly remotePubkey: string;
  readonly polite: boolean;
  pc: RTCPeerConnection;

  private readonly send: PeerOptions['send'];
  private readonly events: PeerEvents;
  private readonly sessionId: string;
  private readonly iceTransportPolicy: RTCIceTransportPolicy;
  private readonly initiator: boolean;
  private readonly trickle: boolean;
  private readonly connectTimeoutMs: number;
  private recvOnlyBootstrapped = false;
  private readonly simple: SimplePeerInstance;
  private readonly control: PeerControlChannel;
  private readonly remoteTracks: PeerRemoteTracks;
  private readonly binding: PeerSessionBinding;
  private localMedia = new Map<VoiceTrackKind, LocalMedia>();
  private outboundSeq = 0;
  private connected = false;
  private closed = false;
  private localVideoCap: VideoCap | null = null;
  private inboundCap: VoiceQualityHint | null = null;
  private connectWatchdog: ReturnType<typeof setTimeout> | null = null;
  private statsMonitor: StatsMonitorHandle | null = null;

  constructor(opts: PeerOptions) {
    this.remotePubkey = opts.remotePubkey;
    this.polite = opts.polite;
    this.send = opts.send;
    this.events = opts.events;
    this.sessionId = opts.sessionId;
    this.iceTransportPolicy = opts.iceTransportPolicy ?? ICE_TRANSPORT_POLICY;
    this.initiator = !this.polite;
    this.trickle = opts.trickle ?? true;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? INITIAL_CONNECT_TIMEOUT_MS;
    this.remoteTracks = new PeerRemoteTracks(this.events);
    this.binding = new PeerSessionBinding({ remotePubkey: this.remotePubkey, events: this.events });
    this.simple = this.createSimplePeer();
    this.pc = this.rawPc();
    this.control = new PeerControlChannel({
      channel: this.simple,
      events: this.events,
      sessionId: this.sessionId,
      isClosed: () => this.closed,
      onSignal: (payload) => { void this.handleSignal(payload).catch((error) => {
        console.warn('[voice] data-channel signal failed', error);
      }); },
    }, opts.control);
  }

  private createSimplePeer(): SimplePeerInstance {
    const simple = newSimplePeer({
      initiator: this.initiator,
      trickle: this.trickle,
      iceTransportPolicy: this.iceTransportPolicy,
    });
    const pc = (simple as SimplePeerInstance & { _pc: RTCPeerConnection })._pc;
    const nativeStateHandler = pc.onconnectionstatechange;
    pc.onconnectionstatechange = (event) => {
      nativeStateHandler?.call(pc, event);
      this.handleConnectionState(pc.connectionState);
    };

    simple.on('signal', (data) => {
      void this.sendSignal({ type: 'peer', peerSignal: data }).catch((error) => {
        console.warn('[voice] simple-peer signal publish failed', error);
      });
    });
    simple.on('track', (track, stream) => this.remoteTracks.handleTrack(track, stream));
    simple.on('connect', () => {
      this.handleConnected();
      this.control.start();
    });
    simple.on('data', (data) => this.control.handle(decodeControl(data)));
    simple.on('error', (error) => {
      console.warn('[voice] simple-peer error for', this.remotePubkey.slice(0, 8), error);
    });
    simple.on('close', () => {
      if (!this.closed) this.handleConnectionState('closed');
    });

    this.connectWatchdog = setTimeout(() => {
      this.connectWatchdog = null;
      if (!this.closed && !this.connected) this.events.onPeerDead?.('open-timeout');
    }, this.connectTimeoutMs);
    console.log('[voice] simple-peer PC', this.remotePubkey.slice(0, 8), 'initiator=', this.initiator);
    return simple;
  }

  private rawPc(): RTCPeerConnection {
    return (this.simple as SimplePeerInstance & { _pc: RTCPeerConnection })._pc;
  }

  private async sendSignal(payload: Omit<VoiceSignalPayload, 'sessionId' | 'seq'>): Promise<void> {
    if (this.closed) return;
    const signal = { ...payload, sessionId: this.sessionId, seq: ++this.outboundSeq };
    // Initial negotiation and disconnected/legacy peers still use the relay.
    if (this.connected && this.control.sendSignal(signal)) return;
    await this.send(signal);
  }

  private handleConnectionState(state: RTCPeerConnectionState): void {
    this.events.onConnectionStateChange(state);
    if (state === 'connected') this.handleConnected();
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      if (this.connected) {
        this.connected = false;
        this.events.onConnectionLost?.();
      }
    }
  }

  private handleConnected(): void {
    if (this.closed || this.connected) return;
    this.connected = true;
    if (this.connectWatchdog) {
      clearTimeout(this.connectWatchdog);
      this.connectWatchdog = null;
    }
    this.events.onConnectionEstablished?.();
    if (this.events.onQualitySample) {
      this.statsMonitor = startStatsMonitor(this.pc, this.events.onQualitySample);
    }
  }

  broadcastControl(message: ControlMessage): void {
    this.control.broadcast(message);
  }

  isControlOpen(): boolean {
    return this.control.isOpen();
  }

  async setLocalTrack(kind: VoiceTrackKind, track: MediaStreamTrack | null): Promise<void> {
    if (this.closed) return;
    const current = this.localMedia.get(kind);
    if (current?.track === track) return;
    if (track) {
      await this.sendSignal({ type: 'trackinfo', trackInfo: { trackId: track.id, kind } });
    }
    if (current && track) {
      this.simple.replaceTrack(current.track, track, current.stream);
      this.localMedia.set(kind, { track, stream: current.stream });
    } else if (current) {
      this.simple.removeTrack(current.track, current.stream);
      this.localMedia.delete(kind);
    } else if (track) {
      const stream = new MediaStream([track]);
      this.simple.addTrack(track, stream);
      this.localMedia.set(kind, { track, stream });
    }
    if (kind === 'audio') await this.applyAudioSenderParams();
    if (kind === 'camera' || kind === 'screen') await this.applyVideoSenderParams(kind);
  }

  /** The deterministic simple-peer initiator creates offers automatically. */
  async kickControlOffer(): Promise<void> { this.bootstrapRecvOnly(); }
  async kickInitialOffer(): Promise<void> { this.bootstrapRecvOnly(); }

  private bootstrapRecvOnly(): void {
    if (this.recvOnlyBootstrapped || this.closed) return;
    this.recvOnlyBootstrapped = true;
    this.simple.addTransceiver('video', { direction: 'recvonly' });
    this.simple.addTransceiver('audio', { direction: 'recvonly' });
  }

  async handleSignal(payload: VoiceSignalPayload): Promise<void> {
    if (this.closed) return;
    if (!this.binding.accepts(payload)) return;
    if (payload.type === 'bye') {
      this.events.onPeerDead?.(`bye:${payload.byeReason ?? 'remote-bye'}`);
      return;
    }
    if (payload.type === 'trackinfo' && payload.trackInfo) {
      this.remoteTracks.announce(payload.trackInfo.trackId, payload.trackInfo.kind, payload.trackInfo.originPubkey);
      return;
    }
    if (payload.type === 'qualityhint') {
      this.inboundCap = payload.qualityHint ?? null;
      await this.applyVideoSenderParams('camera');
      await this.applyVideoSenderParams('screen');
      return;
    }
    if (payload.type === 'requestReset') {
      this.events.onPeerDead?.('reset-requested');
      return;
    }
    try {
      feedSimplePeer(this.simple, payload);
    } catch (error) {
      console.warn('[voice] simple-peer rejected signal', error);
    }
  }

  /**
   * Ask the remote to rebuild its side too. Sent when we rebuild ours
   * without a bye (open timeout, closed PC): otherwise the remote keeps
   * waiting on a connection that no longer exists until its own timeout.
   * A lost requestReset leaves the remote negotiating against a Peer that
   * is gone until its 7 s heartbeat timeout, so a loss is said.
   */
  requestReset(): void {
    if (this.closed) return;
    this.sendUnawaited({ type: 'requestReset' });
  }

  /**
   * A signal nobody waits on. `send` retries rate limits and rethrows
   * everything else without a log, so the loss is reported here.
   */
  private sendUnawaited(payload: Omit<VoiceSignalPayload, 'sessionId' | 'seq'>): void {
    void Promise.resolve(this.send({ ...payload, sessionId: this.sessionId, seq: ++this.outboundSeq })).catch((err) => {
      console.warn(`[voice] ${payload.type} not delivered to`, this.remotePubkey.slice(0, 8), err);
    });
  }

  async setLocalVideoCap(cap: VideoCap | null): Promise<void> {
    this.localVideoCap = cap;
    await this.applyVideoSenderParams('camera');
    await this.applyVideoSenderParams('screen');
  }

  async sendQualityHint(hint: VoiceQualityHint): Promise<void> {
    await this.sendSignal({ type: 'qualityhint', qualityHint: hint });
  }

  private async applyVideoSenderParams(kind: 'camera' | 'screen'): Promise<void> {
    const media = this.localMedia.get(kind);
    if (!media) return;
    await applyVideoSenderParams(this.pc, media.track, kind, this.localVideoCap, this.inboundCap);
  }

  async applyAudioSenderParams(): Promise<void> {
    const media = this.localMedia.get('audio');
    if (!media) return;
    await applyAudioSenderParams(this.pc, media.track);
  }

  close(options: { notifyRemote?: boolean } = {}): void {
    if (this.closed) return;
    this.closed = true;
    if (options.notifyRemote !== false) {
      this.control.broadcast({ type: 'bye', reason: 'local-leave' });
      // The control-channel bye above covers a connected peer; a peer that
      // never connected only learns from this relay bye, so a lost one is
      // worth a line.
      this.sendUnawaited({ type: 'bye', byeReason: 'local-leave' });
    }
    if (this.connectWatchdog) clearTimeout(this.connectWatchdog);
    this.control.stop();
    this.remoteTracks.stop();
    this.statsMonitor?.stop();
    this.statsMonitor = null;
    this.simple.destroy();
    if (this.connected) {
      this.connected = false;
      this.events.onConnectionLost?.();
    }
  }
}
