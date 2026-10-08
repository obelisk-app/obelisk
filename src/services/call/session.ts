/**
 * One 1:1 DM call: one mesh `Peer`, one throwaway-key signaling channel,
 * and the local capture (`DmLocalMedia`, `local-media.ts`).
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
 *    then says `hello` on the call relays - reliably, re-sent until acked.
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

import { Peer, type PeerOptions } from '@/services/voice/peer';
import { emptyVoiceMetrics } from '@/services/voice/metrics';
import type { VoiceSignalPayload, VoiceTrackKind } from '@/types/voice/protocol';
import { getPublicKey } from 'nostr-tools';
import { CallSignalChannel } from './signaling';
import { DmLocalMedia } from './local-media';
import { DmRemoteMedia } from './remote-media';
import { CallLiveness } from './call-liveness';
import { OfferGate, sessionId, type DmCallPhase, type DmCallSessionOptions } from './session-config';

export type { DmCallMediaState, DmCallPhase, DmCallSessionOptions } from './session-config';

export class DmCallSession {
  private readonly opts: DmCallSessionOptions;
  private readonly channel: CallSignalChannel;
  readonly selfEph: string;
  private peer: Peer | null = null;
  /** Our `sessionId` on the current `Peer`, to purge its re-sends when dropped. */
  private peerSession: string | null = null;
  private readonly offers = new OfferGate();
  private listening = false;
  private building = false;
  private phase: DmCallPhase = 'connecting';
  private readonly liveness = new CallLiveness();
  private readonly media: DmLocalMedia;
  private readonly remote = new DmRemoteMedia();
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
    this.media = new DmLocalMedia({
      video: opts.video,
      getUserMedia: opts.getUserMedia,
      getDisplayMedia: opts.getDisplayMedia,
      ended: () => this.ended,
      peer: () => this.peer,
      onChanged: () => this.emitMedia(),
    });
  }

  /** Acquire the mic (and camera for a video call). Call before `connect`. */
  acquireMedia(): Promise<void> {
    return this.media.acquire();
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
    this.liveness.armConnectDeadline(() => this.end('connect-failed'));
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
    void this.media.attachTo(peer);
    if (this.opts.role === 'caller') void peer.kickInitialOffer();
  }

  private onSignal(payload: VoiceSignalPayload, id: number): void {
    if (this.ended || !this.offers.admit(payload, id)) return;
    if (!this.peer) {
      // The callee builds on the first offer if it hasn't already.
      if (this.opts.role === 'callee') this.buildPeer();
      else return;
    }
    void this.peer?.handleSignal(payload);
  }

  private onConnected(): void {
    this.liveness.connected();
    this.setPhase('connected');
  }

  private onLost(): void {
    if (this.ended) return;
    this.setPhase('reconnecting');
    this.liveness.armGiveUp(() => this.end('connection-lost'));
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
      if (this.liveness.everConnected) this.onLost();
      return;
    }
    if (this.liveness.rebuildExhausted()) {
      this.end('connect-failed');
      return;
    }
    peer.requestReset();
    this.dropPeer(false);
    if (this.liveness.everConnected) this.onLost();
    this.buildPeer();
  }

  private dropPeer(notifyRemote: boolean): void {
    const peer = this.peer;
    this.peer = null;
    if (this.peerSession) this.channel.dropSession(this.peerSession);
    this.peerSession = null;
    peer?.close({ notifyRemote });
    this.remote.clear();
    this.emitMedia();
  }

  private addRemoteTrack(track: MediaStreamTrack, kind: VoiceTrackKind): void {
    this.remote.add(track, kind);
    this.emitMedia();
  }

  private removeRemoteTrack(trackId: string): void {
    if (this.remote.remove(trackId)) this.emitMedia();
  }

  // -- controls ---------------------------------------------------------

  setMic(on: boolean): void { this.media.setMic(on); }
  setCamera(on: boolean): Promise<void> { return this.media.setCamera(on); }
  /** Front / back camera on phones. No-op while the camera is off. */
  flipCamera(): Promise<void> { return this.media.flipCamera(); }
  setScreenShare(on: boolean): Promise<void> { return this.media.setScreenShare(on); }

  /** Hang up. Tells the other side over the call relay before closing. */
  hangup(): void {
    this.end('local-hangup', true);
  }

  end(reason: string, notifyRemote = false): void {
    if (this.ended) return;
    this.ended = true;
    // Privacy first: the microphone, camera and screen are released before
    // anything that can throw. A `Peer` that refuses to close must not be
    // able to keep the tab's capture indicator lit on a call that is over.
    this.media.releaseAll();
    this.liveness.stop();
    const peer = this.peer;
    this.peer = null;
    try { peer?.close({ notifyRemote }); } catch (err) {
      console.warn('[dm-call] peer.close threw on end; the call is over anyway', err);
    }
    // Give the bye a moment (and a re-send or two) before the sockets go.
    const channel = this.channel;
    setTimeout(() => channel.close(), notifyRemote ? 2500 : 0);
    this.remote.clear();
    this.emitMedia();
    this.setPhase('ended', reason);
  }

  private setPhase(phase: DmCallPhase, reason?: string): void {
    if (this.phase === phase && phase !== 'ended') return;
    this.phase = phase;
    this.opts.onPhase(phase, reason);
  }

  private emitMedia(): void {
    this.opts.onMedia({ ...this.media.snapshot(), ...this.remote.snapshot() });
  }
}
