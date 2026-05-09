/**
 * Single `RTCPeerConnection` wrapper implementing the MDN perfect-negotiation
 * pattern, plus an ICE-restart → hard-reset reconnect ladder ported from the
 * legacy obelisk repo's `WebSocketVoiceClient` (`obelisk/src/lib/voice.ts`
 * `scheduleReconnect`/`performIceRestart`/`performHardReset`).
 *
 * The owner (`VoiceClient`) decides polite/impolite by lexicographic pubkey
 * comparison and supplies a `send(payload)` callback wired to the Nostr
 * signaling transport. Track-kind announcements travel out-of-band as
 * `trackInfo` payloads because the receiver's `ontrack` only sees the bare
 * track and we need to know `camera` vs `screen` vs `screen-audio` before
 * slotting it into the UI.
 *
 * Reconnect overview:
 *  - Initial-handshake watchdog: fires after `INITIAL_CONNECT_TIMEOUT_MS` if
 *    the peer never reaches `'connected'`. Impolite → hard-reset; polite →
 *    publish a `requestReset` so the impolite peer rebuilds.
 *  - Steady-state recovery: on `'failed'` / `'disconnected'`, schedule
 *    incrementally-backed-off recovery attempts. Impolite calls
 *    `pc.restartIce()` up to `ICE_RESTART_LIMIT` times, then escalates to a
 *    full hard-reset (close + new PC + re-attach all senders). Polite waits
 *    longer and asks the impolite side to reset to avoid offer glare.
 *  - On `requestReset` from the polite peer, the impolite side performs a
 *    hard reset and the resulting `addTrack`s drive a fresh negotiation.
 */
import type { VoiceSignalPayload, VoiceTrackKind, VoiceQualityHint } from './types';
import { startStatsMonitor, type QualitySample, type StatsMonitorHandle } from './stats';
import { AUDIO_MAX_BITRATE } from './quality';
import { ControlChannel, type ControlMessage } from './control-channel';
import type { VoiceMetrics } from './metrics';

// ── Reconnect schedule ───────────────────────────────────────────────────
//
// Start small so transient ICE hiccups (Wi-Fi roam, ~1–2 s) self-heal without
// a visible gap, then back off so we don't hammer dead peers. The first
// retry fires fast (1 s) so a single dropped offer/answer round-trip during
// the initial handshake doesn't strand the user behind the watchdog.
export const RECONNECT_DELAYS_MS = [1000, 2500, 5000, 10000, 15000];
// Polite side waits longer because it's asking the remote to do a full PC
// rebuild — we don't want to spam those requests.
export const POLITE_RESET_DELAYS_MS = [6000, 10000, 16000];
// After this many ICE restarts we escalate to a full PC recreate.
export const ICE_RESTART_LIMIT = 3;
// Max time the initial handshake is allowed to sit before we treat it as
// wedged and trigger a fresh PC. Lowered from 15 s to 8 s — beyond ~8 s
// the user perceives the channel as "stuck" and reflexively refreshes,
// which is exactly what the reconnect ladder is meant to prevent. The
// polite/impolite request-reset path picks up immediately at this mark.
export const INITIAL_CONNECT_TIMEOUT_MS = 25000;

// After we send an offer we expect an answer back fast — the round-trip
// is one relay-mediated kind 25050 in each direction. If signalingState
// is still 'have-local-offer' after this window, the answer either
// never arrived or the relay dropped one of the legs. Resend the same
// SDP up to OFFER_RETRY_LIMIT times before logging and giving up. This
// is the "I had to refresh to get my video to appear" bug class —
// turning on the camera triggers a renegotiation that gets silently
// dropped, the PC is still 'connected' so the connect watchdog never
// fires, and the remote never sees the new transceiver.
//
// The watchdog only arms AFTER the initial PC has reached 'connected'
// (i.e. for mid-call renegotiations). The initial handshake is covered
// by `armConnectWatchdog`, which has its own escalation path; running
// both on the same first offer would double up resets.
//
// 8 s gives the relay + SFU forwarding path generous time before
// declaring the leg dropped — the SFU's own offer-to-other-peers
// renegotiation can take a few seconds before the answer to ours lands.
//
// We intentionally do NOT escalate to performHardReset here. A wedged
// renegotiation on a connected PC is recoverable via more SDP resends;
// blowing away the PC also loses every live media track and forces
// fresh getUserMedia trackIds, which the SFU treats as new ingest
// (and "ended via renegotiation" for the old IDs). The connect
// watchdog still owns the hard-reset path for genuinely stuck PCs.
export const OFFER_ACK_TIMEOUT_MS = 8000;
export const OFFER_RETRY_LIMIT = 2;

/**
 * STUN-only configurations work on permissive NATs but fail on symmetric /
 * carrier-grade NATs. Set `NEXT_PUBLIC_TURN_URLS` (comma-separated) for a
 * TURN fallback; provide `NEXT_PUBLIC_TURN_USERNAME` and
 * `NEXT_PUBLIC_TURN_CREDENTIAL` if the TURN needs auth. Use
 * `NEXT_PUBLIC_FORCE_RELAY=1` to force `iceTransportPolicy: 'relay'` for
 * connectivity debugging.
 */
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  const turnUrls = (process.env.NEXT_PUBLIC_TURN_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (turnUrls.length > 0) {
    const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
    servers.push({ urls: turnUrls, ...(username ? { username } : {}), ...(credential ? { credential } : {}) });
  }
  return servers;
}

const ICE_SERVERS: RTCIceServer[] = buildIceServers();
const ICE_TRANSPORT_POLICY: RTCIceTransportPolicy =
  process.env.NEXT_PUBLIC_FORCE_RELAY === '1' ? 'relay' : 'all';

export interface PeerEvents {
  /**
   * `originPubkey` is set when this RTC peer is forwarding a track that
   * originated elsewhere (the SFU forwarding-pattern). Mesh peers omit it
   * — for them the RTC remote IS the origin. The owner (`VoiceClient`)
   * keys participant tiles by `originPubkey ?? remotePubkey`.
   */
  onRemoteTrack(track: MediaStreamTrack, stream: MediaStream, kind: VoiceTrackKind, originPubkey?: string): void;
  onRemoteTrackEnded(trackId: string): void;
  onConnectionStateChange(state: RTCPeerConnectionState): void;
  /** Fires when the underlying `pc` reaches `'connected'`. Used by the
   *  client to add this pubkey to the `connectedTo` beacon list. */
  onConnectionEstablished?(): void;
  /** Fires when the underlying `pc` leaves `'connected'` (transition to
   *  `'failed' | 'disconnected' | 'closed'`). Used by the client to remove
   *  this pubkey from the `connectedTo` beacon list. */
  onConnectionLost?(): void;
  onQualitySample?(sample: QualitySample): void;
  /** Control-channel: remote sent a `hello` with their current peer list. */
  onTransitivePeers?(remotePeers: string[], remoteBuild: string): void;
  /** Control-channel: remote announces a peer they just connected to. */
  onControlPeerAdded?(pubkey: string): void;
  /** Control-channel: remote announces a peer they just lost. */
  onControlPeerRemoved?(pubkey: string): void;
  /** Control-channel detected the peer is gone (heartbeat lost / bye / channel closed).
   *  This is the FAST hangup path — owner should tear the peer down. */
  onPeerDead?(reason: string): void;
}

export interface PeerOptions {
  remotePubkey: string;
  /** True when our pubkey is lexicographically greater than the remote's;
   *  the polite peer rolls back on offer glare. */
  polite: boolean;
  sessionId: string;
  send: (payload: VoiceSignalPayload) => Promise<void> | void;
  events: PeerEvents;
  /** Optional control-channel hookup. When provided, an `obelisk-control`
   *  RTCDataChannel is opened over the PC for fast hangup detection and
   *  transitive peer discovery. Tests may omit to keep the Peer minimal. */
  control?: {
    selfBuild: string;
    metrics: VoiceMetrics;
    /** Snapshot of pubkeys we're currently connected to. Sent in `hello`. */
    getCurrentPeers: () => string[];
  };
}

export class Peer {
  readonly remotePubkey: string;
  readonly polite: boolean;
  private readonly send: PeerOptions['send'];
  private readonly events: PeerEvents;
  private readonly sessionId: string;
  private readonly controlOpts: PeerOptions['control'];
  private controlChannel: ControlChannel | null = null;

  pc: RTCPeerConnection;

  private makingOffer = false;
  private ignoreOffer = false;
  private outboundSeq = 0;
  /** Track-id → kind, applied in `ontrack`. Sender announces via `trackInfo`. */
  private remoteTrackKinds = new Map<string, VoiceTrackKind>();
  /** Track-id → origin pubkey, set when the SFU forwards a track. Same
   *  trackInfo path as the kind map; populated only when `originPubkey`
   *  was present on the inbound payload. */
  private remoteTrackOrigins = new Map<string, string>();
  /** Senders we've added so we can replace/remove them when toggling cam/screen. */
  private localSenders = new Map<VoiceTrackKind, RTCRtpSender>();
  /** Tracks we've attached, kept here separately so we can re-attach them on
   *  hard reset. The local sender map is rebuilt as part of that re-attach. */
  private localTracks = new Map<VoiceTrackKind, MediaStreamTrack>();
  private remoteStreams = new Map<string, MediaStream>();
  private closed = false;
  /** Mirrors whether the underlying `pc` is currently in `'connected'`.
   *  Drives the `onConnectionEstablished` / `onConnectionLost` edges so
   *  the owner doesn't have to track them itself. */
  private wasConnected = false;
  /** Cap requested by the remote peer for our outbound video. */
  private inboundCap: VoiceQualityHint | null = null;
  /** Cap chosen locally for our outbound video (user picked 720p, etc). */
  private localVideoCap: { maxBitrate: number | null; maxFramerate: number } | null = null;
  private statsMonitor: StatsMonitorHandle | null = null;

  // Reconnect state.
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private connectWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Outstanding offer-ack watchdog. Armed each time we send an offer.
   * Cleared when signalingState returns to 'stable' (answer applied).
   * If it fires we resend the same SDP — see OFFER_ACK_TIMEOUT_MS.
   */
  private offerAckTimer: ReturnType<typeof setTimeout> | null = null;
  private offerRetryAttempts = 0;

  /**
   * Last `sessionId` we observed in any signal from the remote peer.
   * If a fresh signal arrives with a different sessionId we know the
   * remote side rebuilt their PeerConnection (e.g. werift SFU restart,
   * crash, or requestReset response) and our local PC's m-line order /
   * negotiated codecs no longer match — applying the new offer would fail
   * with "order of m-lines doesn't match". A session change therefore
   * triggers a local hard reset so we negotiate fresh.
   */
  private remoteSessionId: string | null = null;

  /**
   * ICE candidates received before `setRemoteDescription` was applied
   * have nowhere to go — `addIceCandidate` rejects with
   * "The remote description was null". Buffer them here until the
   * offer/answer lands, then drain in order.
   */
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(opts: PeerOptions) {
    this.remotePubkey = opts.remotePubkey;
    this.polite = opts.polite;
    this.send = opts.send;
    this.events = opts.events;
    this.sessionId = opts.sessionId;
    this.controlOpts = opts.control;
    this.pc = this.createPc();
    this.attachControlChannel();
    this.armConnectWatchdog();
  }

  /** Lazily build the control channel for the current `pc`. Called from
   *  the constructor and from `performHardReset` when `pc` is replaced. */
  private attachControlChannel(): void {
    if (!this.controlOpts) return;
    if (this.closed) return;
    // Polite/impolite for the data channel mirrors the SDP polite/impolite
    // — only one side may call `createDataChannel` to avoid two parallel
    // channels per peer pair. Our SDP `polite` means "I roll back on
    // glare"; that side is therefore the one that does NOT create.
    const impolite = !this.polite;
    this.controlChannel = new ControlChannel({
      pc: this.pc,
      impolite,
      sessionId: this.sessionId,
      selfBuild: this.controlOpts.selfBuild,
      remotePubkey: this.remotePubkey,
      initialPeers: this.controlOpts.getCurrentPeers,
      metrics: this.controlOpts.metrics,
      events: {
        onHello: (peers, build) => {
          try { this.events.onTransitivePeers?.(peers, build); }
          catch (e) { console.warn('[voice] onTransitivePeers threw', e); }
        },
        onPeerAdded: (pubkey) => {
          try { this.events.onControlPeerAdded?.(pubkey); }
          catch (e) { console.warn('[voice] onControlPeerAdded threw', e); }
        },
        onPeerRemoved: (pubkey) => {
          try { this.events.onControlPeerRemoved?.(pubkey); }
          catch (e) { console.warn('[voice] onControlPeerRemoved threw', e); }
        },
        onBye: (reason) => {
          try { this.events.onPeerDead?.(`bye:${reason}`); }
          catch (e) { console.warn('[voice] onPeerDead threw', e); }
        },
        onDead: (reason) => {
          try { this.events.onPeerDead?.(reason); }
          catch (e) { console.warn('[voice] onPeerDead threw', e); }
        },
        onRtt: () => { /* metrics updated inside ControlChannel */ },
      },
    });
  }

  /** Owner broadcasts: tell the remote we just connected to / lost a peer. */
  broadcastControl(msg: ControlMessage): void {
    this.controlChannel?.send(msg);
  }

  /** True iff the control channel is open and ready. Tests + dial loop. */
  isControlOpen(): boolean {
    return this.controlChannel?.isOpen() ?? false;
  }

  private createPc(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceTransportPolicy: ICE_TRANSPORT_POLICY });
    if (typeof console !== 'undefined') {
      console.log('[voice] new PC for', this.remotePubkey.slice(0, 8), 'iceServers=', ICE_SERVERS.map(s => s.urls), 'policy=', ICE_TRANSPORT_POLICY);
    }

    pc.onnegotiationneeded = async () => {
      // kickNegotiation + onnegotiationneeded can race when we add a track
      // to an already-connected peer. Whoever sets makingOffer first wins;
      // the other bails so we don't double-call setLocalDescription.
      if (this.makingOffer || pc.signalingState !== 'stable') {
        console.log('[voice] negotiationneeded skip — busy', pc.signalingState, 'peer', this.remotePubkey.slice(0, 8));
        return;
      }
      console.log('[voice] negotiationneeded for', this.remotePubkey.slice(0, 8), 'state=', pc.signalingState);
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) {
          await this.sendSignal({
            type: 'offer',
            sdp: pc.localDescription.sdp,
            sessionId: this.sessionId,
            seq: ++this.outboundSeq,
          });
          this.armOfferAckWatchdog();
        }
      } catch (e) {
        console.error('[voice] negotiationneeded failed', e);
      } finally {
        this.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      void this.sendSignal({
        type: 'ice',
        candidates: [candidate.toJSON()],
        sessionId: this.sessionId,
        seq: ++this.outboundSeq,
      });
    };

    // Once an answer is applied (or the PC otherwise leaves
    // 'have-local-offer'), our offer reached the remote. Clear the
    // watchdog so a subsequent renegotiation starts with a fresh
    // retry counter.
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable') {
        this.clearOfferAckWatchdog(true);
      }
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.remoteStreams.set(ev.track.id, stream);
      const kind = this.remoteTrackKinds.get(ev.track.id)
        ?? (ev.track.kind === 'audio' ? 'audio' : 'camera');
      const origin = this.remoteTrackOrigins.get(ev.track.id);
      console.log('[voice] ontrack', kind, 'from', this.remotePubkey.slice(0, 8),
        origin ? `origin=${origin.slice(0, 8)}` : '');
      ev.track.onended = () => {
        this.events.onRemoteTrackEnded(ev.track.id);
        this.remoteStreams.delete(ev.track.id);
        this.remoteTrackKinds.delete(ev.track.id);
        this.remoteTrackOrigins.delete(ev.track.id);
      };
      // When the sender calls `pc.removeTrack(...)` (camera off, screen-share
      // ended, peer dropped without a clean bye), the receiver does NOT get
      // an `ended` event — only `mute`. Without handling it the <video>
      // element keeps the last frame painted, so the UI looks like the peer
      // is still presenting. Treat a video mute as "track gone for now": fire
      // onRemoteTrackEnded so the React layer drops the stream entry. If the
      // sender re-enables, `unmute` (or a fresh `ontrack`) re-adds it.
      // Audio mute is intentionally ignored — silent audio is still valid
      // playback state and the speaking detector handles silence on its own.
      if (kind === 'camera' || kind === 'screen') {
        ev.track.onmute = () => {
          console.log('[voice] remote', kind, 'muted from', this.remotePubkey.slice(0, 8));
          this.events.onRemoteTrackEnded(ev.track.id);
        };
        ev.track.onunmute = () => {
          console.log('[voice] remote', kind, 'unmuted from', this.remotePubkey.slice(0, 8));
          // Re-emit the same track + stream — the React layer keys on
          // trackId, so this is an upsert not a duplicate.
          this.events.onRemoteTrack(ev.track, stream, kind, origin);
        };
      }
      this.events.onRemoteTrack(ev.track, stream, kind, origin);
    };

    pc.onconnectionstatechange = () => {
      console.log('[voice] connectionState', pc.connectionState, 'peer', this.remotePubkey.slice(0, 8));
      this.events.onConnectionStateChange(pc.connectionState);
      this.handleConnectionStateChange(pc.connectionState);
    };

    return pc;
  }

  // ── Connection state + reconnect ────────────────────────────────────────

  private handleConnectionStateChange(state: RTCPeerConnectionState): void {
    if (state === 'connected') {
      // Apply encoder caps now that ICE/DTLS are up. Calling setParameters
      // during negotiation works on Chrome but throws InvalidStateError on
      // some Safari/Android builds; deferring to 'connected' is safe.
      void this.applyAudioSenderParams();
      void this.applyVideoSenderParams();
      if (!this.statsMonitor && this.events.onQualitySample) {
        this.statsMonitor = startStatsMonitor(this.pc, (s) => this.events.onQualitySample?.(s));
      }
      this.clearRecoveryTimers();
      if (!this.wasConnected) {
        this.wasConnected = true;
        try { this.events.onConnectionEstablished?.(); } catch (e) { console.warn('[voice] onConnectionEstablished threw', e); }
      }
      return;
    }

    if (state === 'failed' || state === 'disconnected') {
      if (this.wasConnected) {
        this.wasConnected = false;
        try { this.events.onConnectionLost?.(); } catch (e) { console.warn('[voice] onConnectionLost threw', e); }
      }
      this.scheduleReconnect();
      return;
    }

    if (state === 'closed') {
      if (this.statsMonitor) { this.statsMonitor.stop(); this.statsMonitor = null; }
      if (this.wasConnected) {
        this.wasConnected = false;
        try { this.events.onConnectionLost?.(); } catch (e) { console.warn('[voice] onConnectionLost threw', e); }
      }
      // No reconnect on explicit close — owner is tearing down.
    }
  }

  private armConnectWatchdog(): void {
    if (this.closed) return;
    if (this.connectWatchdogTimer) clearTimeout(this.connectWatchdogTimer);
    this.connectWatchdogTimer = setTimeout(() => {
      this.connectWatchdogTimer = null;
      if (this.closed) return;
      if (this.pc.connectionState === 'connected') return;
      console.warn('[voice] initial connect timeout for', this.remotePubkey.slice(0, 8),
        '— state:', this.pc.connectionState, 'polite:', this.polite);
      // Send requestReset so the remote can clear stale state, then ALWAYS
      // hard-reset locally so we drive a fresh offer. Without the local
      // hard reset, polite peers would just sit waiting for a remote redial
      // that the SFU never initiates.
      if (this.polite) {
        this.requestRemoteReset();
      }
      this.performHardReset();
    }, INITIAL_CONNECT_TIMEOUT_MS);
  }

  private clearRecoveryTimers(): void {
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectWatchdogTimer) {
      clearTimeout(this.connectWatchdogTimer);
      this.connectWatchdogTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    if (this.reconnectTimer) return;
    if (this.pc.connectionState === 'connected') return;

    const delays = this.polite ? POLITE_RESET_DELAYS_MS : RECONNECT_DELAYS_MS;
    const delay = delays[Math.min(this.reconnectAttempts, delays.length - 1)];
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed) return;
      const state = this.pc.connectionState;
      if (state === 'connected') {
        this.reconnectAttempts = 0;
        return;
      }
      this.reconnectAttempts += 1;
      if (this.polite) {
        this.requestRemoteReset();
      } else if (this.reconnectAttempts <= ICE_RESTART_LIMIT) {
        this.performIceRestart();
      } else {
        this.performHardReset();
      }
      // Schedule the next attempt — if this one doesn't land, try again.
      this.scheduleReconnect();
    }, delay);
  }

  private requestRemoteReset(): void {
    console.log('[voice] requesting remote reset from', this.remotePubkey.slice(0, 8),
      'attempt', this.reconnectAttempts);
    void this.sendSignal({
      type: 'requestReset',
      sessionId: this.sessionId,
      seq: ++this.outboundSeq,
    });
  }

  private performIceRestart(): void {
    console.log('[voice] ICE restart for', this.remotePubkey.slice(0, 8),
      'attempt', this.reconnectAttempts);
    try {
      this.pc.restartIce();
    } catch (err) {
      console.warn('[voice] restartIce failed:', err);
    }
  }

  /**
   * Close the current PC, build a fresh one, and re-attach every local
   * track. The new PC's `addTrack` calls fire `onnegotiationneeded`, which
   * drives a fresh offer through the existing signaling path.
   */
  private performHardReset(): void {
    if (this.closed) return;
    console.log('[voice] hard reset for', this.remotePubkey.slice(0, 8));
    if (this.statsMonitor) { this.statsMonitor.stop(); this.statsMonitor = null; }
    // Detach the old PC's handlers BEFORE closing it. `pc.close()` fires
    // `onconnectionstatechange('closed')` and the owner (`VoiceClient`)
    // treats a closed state as "the ladder gave up" and tears the Peer
    // down — which would orphan the brand-new PC we're about to install.
    // Nulling the handlers first makes the close silent so the Peer keeps
    // running with the fresh PC.
    try {
      this.pc.onconnectionstatechange = null;
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onnegotiationneeded = null;
    } catch { /* ignore — old browsers may not allow null assignment */ }
    try { this.pc.close(); } catch { /* already closed */ }
    // Tear down the control channel attached to the old PC; the new
    // attachControlChannel() below will install a fresh one on the new pc.
    if (this.controlChannel) {
      try { this.controlChannel.close('hard-reset'); } catch { /* ignore */ }
      this.controlChannel = null;
    }
    // localSenders refer to the old PC; clear them so re-add creates new ones.
    this.localSenders.clear();
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.pendingIce.length = 0;
    this.pc = this.createPc();
    this.attachControlChannel();
    // If we have no local tracks (e.g. SFU peer with mic/cam off), add
    // recvonly transceivers so the offer SDP has m-sections and the SFU
    // can attach its forwarded tracks. Without this the kickNegotiation
    // below produces an empty offer the SFU has nothing to answer.
    if (this.localTracks.size === 0) {
      try {
        this.pc.addTransceiver('audio', { direction: 'recvonly' });
        this.pc.addTransceiver('video', { direction: 'recvonly' });
      } catch (e) {
        console.warn('[voice] hardReset addTransceiver recvonly failed', e);
      }
    }
    // Re-attach saved local tracks. addTrack fires onnegotiationneeded, but
    // we also kickNegotiation explicitly so the first offer reliably ships.
    for (const [kind, track] of this.localTracks.entries()) {
      try {
        const sender = this.pc.addTrack(track);
        this.localSenders.set(kind, sender);
      } catch (e) {
        console.warn('[voice] re-addTrack failed', kind, e);
      }
      // Re-announce track kind so the receiver still slots it correctly.
      void this.sendSignal({
        type: 'trackinfo',
        trackInfo: { trackId: track.id, kind },
        sessionId: this.sessionId,
        seq: ++this.outboundSeq,
      });
    }
    this.armConnectWatchdog();
    queueMicrotask(() => { void this.kickNegotiation(); });
  }

  // ── Signaling ───────────────────────────────────────────────────────────

  /** Drain any ICE candidates that arrived before remoteDescription was set. */
  private async flushPendingIce(): Promise<void> {
    if (this.pendingIce.length === 0) return;
    const drained = this.pendingIce.slice();
    this.pendingIce.length = 0;
    for (const cand of drained) {
      try {
        await this.pc.addIceCandidate(cand);
      } catch (err) {
        if (!this.ignoreOffer) console.warn('[voice] flushPendingIce add failed', err);
      }
    }
  }

  private async sendSignal(payload: VoiceSignalPayload): Promise<void> {
    try {
      await this.send(payload);
    } catch (e) {
      console.error('[voice] signal send failed', e);
    }
  }

  /**
   * Add or replace a local track of a given kind. Returns nothing — the
   * caller doesn't need the sender; we keep it internally for setParameters
   * + replaceTrack on the same kind.
   */
  async setLocalTrack(kind: VoiceTrackKind, track: MediaStreamTrack | null): Promise<void> {
    if (this.closed) return;
    const existing = this.localSenders.get(kind);
    if (track === null) {
      if (existing) {
        try { this.pc.removeTrack(existing); } catch { /* may already be gone */ }
        this.localSenders.delete(kind);
      }
      this.localTracks.delete(kind);
      return;
    }
    this.localTracks.set(kind, track);
    // Attach the track to the PC FIRST. The trackinfo announcement is
    // best-effort metadata for the UI; previously we awaited the relay
    // round-trip before addTrack, which let a racing remote offer trigger
    // an answer with no outgoing audio (causing "I see them but they can't
    // hear me" on the second joiner). The sender carries media — get it
    // onto the PC immediately, label it asynchronously.
    if (existing) {
      try { await existing.replaceTrack(track); } catch (e) { console.warn('[voice] replaceTrack failed', e); }
    } else {
      try {
        const sender = this.pc.addTrack(track);
        this.localSenders.set(kind, sender);
        // Bias the offer SDP toward modern codecs (VP9 → H.264 → VP8) for
        // the new transceiver. setCodecPreferences must run BEFORE the
        // first setLocalDescription on this transceiver, which we're
        // about to do via kickNegotiation/onnegotiationneeded.
        if (track.kind === 'video') {
          applyVideoCodecPreference(this.pc, sender);
        }
      } catch (e) {
        console.warn('[voice] addTrack failed', e);
        return;
      }
    }
    // Encoder caps are applied from `handleConnectionStateChange` when state
    // hits 'connected', and again whenever the user changes quality. Calling
    // setParameters here can throw on Safari/Android during negotiation.

    // Fire-and-forget: receiver only needs trackinfo to label the tile.
    void this.sendSignal({
      type: 'trackinfo',
      trackInfo: { trackId: track.id, kind },
      sessionId: this.sessionId,
      seq: ++this.outboundSeq,
    });
    // `addTrack` should fire `onnegotiationneeded` automatically, but the
    // event is best-effort: some browsers debounce or skip it when called
    // immediately after PC creation. Kick negotiation explicitly so the
    // first offer reliably reaches the remote.
    queueMicrotask(() => { void this.kickNegotiation(); });
  }

  /**
   * Send an initial offer even when no local tracks are attached. Used for
   * SFU peers where the SFU never initiates — without this, a user who joins
   * with mic/cam off would wait forever for the SFU to offer.
   */
  async kickInitialOffer(): Promise<void> {
    if (this.closed) return;
    // Only useful when no senders have been added (otherwise setLocalTrack
    // already kicked). Add recvonly transceivers so the SDP has m-sections.
    if (this.localSenders.size === 0) {
      try {
        const hasAudio = this.pc.getTransceivers().some((t) => t.receiver?.track?.kind === 'audio');
        const hasVideo = this.pc.getTransceivers().some((t) => t.receiver?.track?.kind === 'video');
        if (!hasAudio) this.pc.addTransceiver('audio', { direction: 'recvonly' });
        if (!hasVideo) this.pc.addTransceiver('video', { direction: 'recvonly' });
      } catch (e) {
        console.warn('[voice] addTransceiver recvonly failed', e);
      }
    }
    await this.kickNegotiation();
  }

  /**
   * Force an SDP offer if the PC is stable and we haven't sent one. No-op
   * during ongoing negotiation — `onnegotiationneeded` will run when stable.
   */
  private async kickNegotiation(): Promise<void> {
    if (this.closed) return;
    if (this.makingOffer) {
      console.log('[voice] kickNegotiation skip — already making offer for', this.remotePubkey.slice(0, 8));
      return;
    }
    if (this.pc.signalingState !== 'stable') {
      console.log('[voice] kickNegotiation skip — state=', this.pc.signalingState, 'for', this.remotePubkey.slice(0, 8));
      return;
    }
    console.log('[voice] kickNegotiation forcing offer to', this.remotePubkey.slice(0, 8));
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) {
        await this.sendSignal({
          type: 'offer',
          sdp: this.pc.localDescription.sdp,
          sessionId: this.sessionId,
          seq: ++this.outboundSeq,
        });
        this.armOfferAckWatchdog();
      }
    } catch (e) {
      console.error('[voice] kickNegotiation failed', e);
    } finally {
      this.makingOffer = false;
    }
  }

  /**
   * Arm the offer-ack watchdog. Only meaningful for renegotiations on a
   * connected PC — the initial handshake is covered by the connect
   * watchdog, and arming here on the first offer would race with that
   * timer's hard-reset path.
   *
   * The watchdog fires after `OFFER_ACK_TIMEOUT_MS`; if the answer
   * hasn't applied by then (signalingState still 'have-local-offer')
   * we resend the same SDP. After `OFFER_RETRY_LIMIT` resends we stop
   * resending — the connection itself is still healthy (audio still
   * flowing), and a hard reset would lose every live track. If the
   * underlying PC is genuinely wedged, the connection-state recovery
   * path (failed/disconnected → scheduleReconnect) will catch it.
   */
  private armOfferAckWatchdog(): void {
    if (this.closed) return;
    if (!this.wasConnected) return;
    if (this.offerAckTimer) clearTimeout(this.offerAckTimer);
    this.offerAckTimer = setTimeout(() => {
      this.offerAckTimer = null;
      if (this.closed) return;
      if (this.pc.signalingState !== 'have-local-offer') {
        // Either we got an answer (back to 'stable') or the PC moved
        // to a different state (rollback, closed). Either way, no
        // resend needed.
        this.offerRetryAttempts = 0;
        return;
      }
      this.offerRetryAttempts += 1;
      if (this.offerRetryAttempts > OFFER_RETRY_LIMIT) {
        console.warn('[voice] offer never acked after', OFFER_RETRY_LIMIT,
          'retries — giving up resends for', this.remotePubkey.slice(0, 8),
          '(connection-state recovery path will pick up if the PC is wedged)');
        this.offerRetryAttempts = 0;
        return;
      }
      console.warn('[voice] offer not acked, resending — peer',
        this.remotePubkey.slice(0, 8), 'attempt', this.offerRetryAttempts);
      void this.resendCurrentOffer();
    }, OFFER_ACK_TIMEOUT_MS);
  }

  /**
   * Clear the offer-ack watchdog. Pass `success=true` when the answer
   * was applied (resets the retry counter); pass `success=false` from
   * teardown paths so the next offer starts with a fresh counter as
   * well — the previous offer is no longer "in flight".
   */
  private clearOfferAckWatchdog(success: boolean): void {
    if (this.offerAckTimer) {
      clearTimeout(this.offerAckTimer);
      this.offerAckTimer = null;
    }
    if (success) this.offerRetryAttempts = 0;
  }

  /**
   * Re-send the SDP currently stored in `pc.localDescription`. Idempotent
   * on the receiver — applying the same offer again is fine; the perfect-
   * negotiation path on the remote will roll back its own pending state
   * if any and reapply ours.
   */
  private async resendCurrentOffer(): Promise<void> {
    if (this.closed) return;
    const desc = this.pc.localDescription;
    if (!desc || desc.type !== 'offer') return;
    try {
      await this.sendSignal({
        type: 'offer',
        sdp: desc.sdp,
        sessionId: this.sessionId,
        seq: ++this.outboundSeq,
      });
    } finally {
      this.armOfferAckWatchdog();
    }
  }

  /**
   * Handle an incoming signaling payload from the remote peer. Implements
   * the MDN perfect-negotiation pattern: polite side rolls back on glare;
   * impolite side ignores the conflicting remote offer. Also handles the
   * polite-side `requestReset` escalation.
   */
  async handleSignal(payload: VoiceSignalPayload): Promise<void> {
    if (this.closed) return;

    if (payload.sessionId) {
      if (this.remoteSessionId === null) {
        this.remoteSessionId = payload.sessionId;
      } else if (this.remoteSessionId !== payload.sessionId) {
        // Remote rebuilt — their m-line ordering / codec PTs may differ.
        // Wipe trackinfo state (origin/kind maps were keyed by the old
        // session's track ids) and hard-reset our PC before processing.
        console.log('[voice] remote sessionId changed for', this.remotePubkey.slice(0, 8),
          'old=', this.remoteSessionId.slice(0, 6), 'new=', payload.sessionId.slice(0, 6),
          '— hard reset');
        this.remoteSessionId = payload.sessionId;
        this.remoteTrackKinds.clear();
        this.remoteTrackOrigins.clear();
        this.performHardReset();
      }
    }

    if (payload.trackInfo) {
      this.remoteTrackKinds.set(payload.trackInfo.trackId, payload.trackInfo.kind);
      if (payload.trackInfo.originPubkey) {
        this.remoteTrackOrigins.set(payload.trackInfo.trackId, payload.trackInfo.originPubkey);
      }
    }

    try {
      if (payload.type === 'requestReset') {
        // Only the impolite side actually rebuilds — that's the side that
        // drives offers. If the polite side got this it would loop.
        if (!this.polite) {
          console.log('[voice] received requestReset from', this.remotePubkey.slice(0, 8), '— hard reset');
          this.performHardReset();
        }
        return;
      }

      if (payload.type === 'offer' && payload.sdp) {
        const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';
        this.ignoreOffer = !this.polite && offerCollision;
        console.log('[voice] handleOffer from', this.remotePubkey.slice(0, 8), 'polite=', this.polite, 'collision=', offerCollision, 'ignored=', this.ignoreOffer);
        if (this.ignoreOffer) return;
        // Explicit rollback before applying the remote offer when our own
        // offer is in flight. The spec says setRemoteDescription({offer}) in
        // 'have-local-offer' state should implicitly roll back, but some
        // browsers leave the SDP setup attr in a bad state ("Answerer must
        // use active or passive"). Explicit rollback avoids that.
        if (offerCollision && this.pc.signalingState === 'have-local-offer') {
          try { await this.pc.setLocalDescription({ type: 'rollback' }); }
          catch (e) { console.warn('[voice] explicit rollback failed', e); }
        }
        await this.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
        await this.flushPendingIce();
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          await this.sendSignal({
            type: 'answer',
            sdp: this.pc.localDescription.sdp,
            sessionId: this.sessionId,
            seq: ++this.outboundSeq,
          });
        }
      } else if (payload.type === 'answer' && payload.sdp) {
        if (this.pc.signalingState === 'have-local-offer') {
          try {
            await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
            await this.flushPendingIce();
            console.log('[voice] applied answer from', this.remotePubkey.slice(0, 8));
          } catch (e) {
            // Most common cause: race where our own offer was sent late so
            // the remote actually answered an earlier (rolled-back) offer
            // and the setup attr no longer matches. Discard and let the
            // next negotiation cycle recover.
            console.warn('[voice] answer apply failed — will renegotiate', e);
            try { await this.pc.setLocalDescription({ type: 'rollback' }); }
            catch { /* already stable */ }
          }
        } else {
          console.warn('[voice] dropping answer in state', this.pc.signalingState, 'from', this.remotePubkey.slice(0, 8));
        }
      } else if (payload.type === 'ice' && payload.candidates?.length) {
        for (const cand of payload.candidates) {
          // ICE that arrives before the offer/answer is applied has
          // nowhere to go — Chrome rejects with "The remote description
          // was null". Buffer it; flushPendingIce drains the queue right
          // after setRemoteDescription succeeds.
          if (!this.pc.remoteDescription) {
            this.pendingIce.push(cand);
            continue;
          }
          try {
            await this.pc.addIceCandidate(cand);
          } catch (err) {
            if (!this.ignoreOffer) console.warn('[voice] addIceCandidate failed', err);
          }
        }
      } else if (payload.type === 'bye') {
        // Surface the bye reason so the owner can distinguish a graceful
        // remote leave from an active capacity rejection. The owner
        // (VoiceClient) maps `room-full` to a user-facing error +
        // automatic leave so the joiner doesn't loop the reconnect ladder.
        if (payload.byeReason) {
          try { this.events.onPeerDead?.(`bye:${payload.byeReason}`); }
          catch (e) { console.warn('[voice] onPeerDead threw on bye reason', e); }
        }
        this.close();
      } else if (payload.type === 'qualityhint' && payload.qualityHint) {
        this.inboundCap = payload.qualityHint;
        await this.applyVideoSenderParams();
      }
    } catch (e) {
      console.error('[voice] handleSignal error', e);
    }
  }

  /** Set the user-chosen outbound video cap (e.g. 720p). null = auto. */
  async setLocalVideoCap(cap: { maxBitrate: number | null; maxFramerate: number } | null): Promise<void> {
    this.localVideoCap = cap;
    if (this.pc.connectionState === 'connected') {
      await this.applyVideoSenderParams();
    }
  }

  /** Send a hint asking the remote peer to cap their outbound video. */
  async sendQualityHint(hint: VoiceQualityHint): Promise<void> {
    await this.sendSignal({
      type: 'qualityhint',
      qualityHint: hint,
      sessionId: this.sessionId,
      seq: ++this.outboundSeq,
    });
  }

  /**
   * Apply current caps (local pick ∩ remote hint) to the video sender(s).
   *
   * We tune camera + screen-share separately because their motion profiles
   * are opposite: camera content prefers smooth framerate (drop resolution
   * under congestion), screen-share prefers sharp text (drop framerate
   * before scaling). Browsers honor `degradationPreference` on the encoder
   * side when bandwidth or CPU forces a tradeoff.
   */
  private async applyVideoSenderParams(): Promise<void> {
    for (const kind of ['camera', 'screen'] as const) {
      const sender = this.localSenders.get(kind);
      if (!sender) continue;
      await this.applyOneVideoSenderParams(sender, kind);
    }
  }

  private async applyOneVideoSenderParams(
    sender: RTCRtpSender,
    kind: 'camera' | 'screen',
  ): Promise<void> {
    const localBitrate = this.localVideoCap?.maxBitrate ?? null;
    const remoteBitrate = this.inboundCap?.maxBitrate ?? null;
    const bitrate = pickMin(localBitrate, remoteBitrate);
    const localFps = this.localVideoCap?.maxFramerate ?? null;
    const remoteFps = this.inboundCap?.maxFramerate ?? null;
    const fps = pickMin(localFps, remoteFps);
    try {
      const params = sender.getParameters() as RTCRtpSendParameters & {
        degradationPreference?: 'maintain-framerate' | 'maintain-resolution' | 'balanced';
      };
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      const enc = params.encodings[0];
      if (bitrate != null) enc.maxBitrate = bitrate;
      else delete enc.maxBitrate;
      if (fps != null) enc.maxFramerate = fps;
      else delete enc.maxFramerate;
      // Camera: smooth motion matters more than peak resolution. Browser
      // is allowed to scale down rather than drop frames under load.
      // Screen: pixels matter more than smoothness. Drop framerate so
      // text stays crisp.
      params.degradationPreference =
        kind === 'camera' ? 'maintain-framerate' : 'maintain-resolution';
      await sender.setParameters(params);
    } catch (e) {
      console.warn('[voice] setParameters failed', e);
    }
  }

  /** Apply the high-quality audio bitrate cap on the audio sender. */
  async applyAudioSenderParams(): Promise<void> {
    const sender = this.localSenders.get('audio');
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = AUDIO_MAX_BITRATE;
      await sender.setParameters(params);
    } catch (e) {
      console.warn('[voice] audio setParameters failed', e);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.connectWatchdogTimer) { clearTimeout(this.connectWatchdogTimer); this.connectWatchdogTimer = null; }
    if (this.statsMonitor) { this.statsMonitor.stop(); this.statsMonitor = null; }
    // Send the control-channel bye BEFORE the relay bye and BEFORE
    // pc.close() so the remote learns instantly even if the relay drops
    // the kind 25050. close() is idempotent on the control channel side.
    if (this.controlChannel) {
      try { this.controlChannel.close('local-leave'); } catch { /* ignore */ }
      this.controlChannel = null;
    }
    void this.sendSignal({
      type: 'bye',
      sessionId: this.sessionId,
      seq: ++this.outboundSeq,
    }).catch(() => {});
    try { this.pc.close(); } catch { /* ignore */ }
    if (this.wasConnected) {
      this.wasConnected = false;
      try { this.events.onConnectionLost?.(); } catch (e) { console.warn('[voice] onConnectionLost threw', e); }
    }
  }
}

function pickMin(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

/** Local re-declaration — some TS lib targets ship an older DOM that
 *  doesn't yet include the `RTCRtpCodecCapability` global. Structural
 *  matching is enough for what we use it for. */
interface CodecCapability {
  mimeType: string;
  clockRate?: number;
  channels?: number;
  sdpFmtpLine?: string;
}

/**
 * Bias the video transceiver toward modern codecs.
 *
 * Order: VP9 → H.264 → VP8 → everything else (AV1 etc.).
 *  - VP9 ships ~30–40% better quality than VP8 at the same bitrate; it's
 *    available in every modern Chromium/Firefox build and increasingly
 *    has hardware decode on mobile.
 *  - H.264 is the universal fallback; ubiquitous hardware encode/decode,
 *    works on every Safari + iOS in existence.
 *  - VP8 is the WebRTC default if neither of the above negotiates.
 *  - AV1 isn't promoted ahead of VP9 because software AV1 encode stutters
 *    on mid-range laptops; let it negotiate as a fallback if both peers
 *    advertise hardware support, but don't force it.
 *
 * Must run BEFORE `setLocalDescription` on this transceiver so the offer
 * SDP carries the preferred order. Called from `setLocalTrack` right
 * after `addTrack` returns the sender.
 *
 * Falls through silently when the API isn't available — Safari before 16
 * exposed `setCodecPreferences` but not `getCapabilities`, and headless
 * test envs don't expose either. The negotiation still works without us;
 * we just don't get the codec bias.
 */
function applyVideoCodecPreference(pc: RTCPeerConnection, sender: RTCRtpSender): void {
  try {
    const caps = (RTCRtpSender as unknown as {
      getCapabilities?: (kind: string) => { codecs: CodecCapability[] } | null;
    }).getCapabilities?.('video');
    if (!caps?.codecs?.length) return;

    // Find the transceiver this sender belongs to. Some browsers expose
    // sender.getTransceiver() but it isn't standard, so we walk the list.
    const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
    const setCodecPrefs = (transceiver as unknown as {
      setCodecPreferences?: (codecs: CodecCapability[]) => void;
    } | undefined)?.setCodecPreferences;
    if (!setCodecPrefs || !transceiver) return;

    const preferred = (mime: string) =>
      caps.codecs.filter((c) => c.mimeType.toLowerCase() === mime);
    const ordered = [
      ...preferred('video/vp9'),
      ...preferred('video/h264'),
      ...preferred('video/vp8'),
      // Keep everything else in its original spot at the bottom (AV1, RTX,
      // ulpfec, red — all required for full negotiation).
      ...caps.codecs.filter((c) => {
        const m = c.mimeType.toLowerCase();
        return m !== 'video/vp9' && m !== 'video/h264' && m !== 'video/vp8';
      }),
    ];

    setCodecPrefs.call(transceiver, ordered);
  } catch (e) {
    // Older browsers throw on unsupported codec lists; harmless.
    console.warn('[voice] codec preference apply failed', e);
  }
}
