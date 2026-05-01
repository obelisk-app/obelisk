/**
 * Single `RTCPeerConnection` wrapper implementing the MDN perfect-negotiation
 * pattern. The owner (`VoiceClient`) decides polite/impolite by lexicographic
 * pubkey comparison and supplies a `send(payload)` callback wired to the
 * Nostr signaling transport.
 *
 * Track-kind announcements travel out-of-band as `trackInfo` on signaling
 * events because the receiver's `ontrack` only sees the bare track and we
 * need to know if it's `camera` vs `screen` vs `screen-audio` before slotting
 * it into the UI.
 */
import type { VoiceSignalPayload, VoiceTrackKind, VoiceQualityHint } from './types';
import { startStatsMonitor, type QualitySample, type StatsMonitorHandle } from './stats';
import { AUDIO_MAX_BITRATE } from './quality';

// SDP munging was tried (Opus stereo + FEC fmtp rewrite) but caused
// `InvalidAccessError: order of m-lines doesn't match` on some real-device
// renegotiations. We rely on `setParameters` for outbound bitrate and let
// browsers negotiate Opus parameters with their defaults — modern Chromium
// and Firefox already pick stereo + FEC when the source is stereo.

/**
 * STUN-only configurations work between hosts on permissive NATs but fail on
 * symmetric / carrier-grade NATs (the common cross-network real-device case:
 * cellular ↔ home Wi-Fi, two different routers, corporate networks). A TURN
 * relay is the only reliable fallback. Set `NEXT_PUBLIC_TURN_URLS` to a
 * comma-separated list of `turn:` / `turns:` URLs; if credentials are needed
 * provide `NEXT_PUBLIC_TURN_USERNAME` and `NEXT_PUBLIC_TURN_CREDENTIAL`.
 *
 * If you have multiple TURN URLs sharing the same credentials (e.g. UDP +
 * TCP + TLS variants), include them all in `NEXT_PUBLIC_TURN_URLS` — they'll
 * be merged into one `RTCIceServer` entry as the spec recommends.
 *
 * Use `NEXT_PUBLIC_FORCE_RELAY=1` while debugging connectivity to force
 * `iceTransportPolicy: 'relay'`, which makes the call go through TURN even
 * if a host candidate could have worked. Useful for proving "TURN works,
 * the bug is elsewhere" or vice versa.
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
  onRemoteTrack(track: MediaStreamTrack, stream: MediaStream, kind: VoiceTrackKind): void;
  onRemoteTrackEnded(trackId: string): void;
  onConnectionStateChange(state: RTCPeerConnectionState): void;
  onQualitySample?(sample: QualitySample): void;
}

export interface PeerOptions {
  remotePubkey: string;
  /** True when our pubkey is lexicographically greater than the remote's;
   *  the polite peer rolls back on offer glare. */
  polite: boolean;
  sessionId: string;
  send: (payload: VoiceSignalPayload) => Promise<void> | void;
  events: PeerEvents;
}

export class Peer {
  readonly remotePubkey: string;
  readonly polite: boolean;
  private readonly send: PeerOptions['send'];
  private readonly events: PeerEvents;
  private readonly sessionId: string;

  pc: RTCPeerConnection;

  private makingOffer = false;
  private ignoreOffer = false;
  private outboundSeq = 0;
  /** Track-id → kind, applied in `ontrack`. Sender announces via `trackInfo`. */
  private remoteTrackKinds = new Map<string, VoiceTrackKind>();
  /** Senders we've added so we can replace/remove them when toggling cam/screen. */
  private localSenders = new Map<VoiceTrackKind, RTCRtpSender>();
  private remoteStreams = new Map<string, MediaStream>();
  private closed = false;
  /** Cap requested by the remote peer for our outbound video. */
  private inboundCap: VoiceQualityHint | null = null;
  /** Cap chosen locally for our outbound video (user picked 720p, etc). */
  private localVideoCap: { maxBitrate: number | null; maxFramerate: number } | null = null;
  private statsMonitor: StatsMonitorHandle | null = null;

  constructor(opts: PeerOptions) {
    this.remotePubkey = opts.remotePubkey;
    this.polite = opts.polite;
    this.send = opts.send;
    this.events = opts.events;
    this.sessionId = opts.sessionId;
    this.pc = this.createPc();
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

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.remoteStreams.set(ev.track.id, stream);
      const kind = this.remoteTrackKinds.get(ev.track.id)
        ?? (ev.track.kind === 'audio' ? 'audio' : 'camera');
      console.log('[voice] ontrack', kind, 'from', this.remotePubkey.slice(0, 8));
      ev.track.onended = () => {
        this.events.onRemoteTrackEnded(ev.track.id);
        this.remoteStreams.delete(ev.track.id);
        this.remoteTrackKinds.delete(ev.track.id);
      };
      this.events.onRemoteTrack(ev.track, stream, kind);
    };

    pc.onconnectionstatechange = () => {
      console.log('[voice] connectionState', pc.connectionState, 'peer', this.remotePubkey.slice(0, 8));
      this.events.onConnectionStateChange(pc.connectionState);
      if (pc.connectionState === 'connected') {
        // Apply encoder caps now that ICE/DTLS are up. Calling setParameters
        // during negotiation works on Chrome but throws InvalidStateError on
        // some Safari/Android builds; deferring to 'connected' is safe everywhere.
        void this.applyAudioSenderParams();
        void this.applyVideoSenderParams();
        if (!this.statsMonitor && this.events.onQualitySample) {
          this.statsMonitor = startStatsMonitor(pc, (s) => this.events.onQualitySample?.(s));
        }
      } else if ((pc.connectionState === 'failed' || pc.connectionState === 'closed') && this.statsMonitor) {
        this.statsMonitor.stop();
        this.statsMonitor = null;
      }
    };

    return pc;
  }

  private async sendSignal(payload: VoiceSignalPayload): Promise<void> {
    try {
      await this.send(payload);
    } catch (e) {
      console.error('[voice] signal send failed', e);
    }
  }

  /**
   * Add or replace a local track of a given kind. Returns the RTCRtpSender
   * so the caller can later stop/remove it.
   */
  async setLocalTrack(kind: VoiceTrackKind, track: MediaStreamTrack | null): Promise<void> {
    if (this.closed) return;
    const existing = this.localSenders.get(kind);
    if (track === null) {
      if (existing) {
        try { this.pc.removeTrack(existing); } catch { /* may already be gone */ }
        this.localSenders.delete(kind);
      }
      return;
    }
    // Attach the track to the PC FIRST. The trackinfo announcement is
    // best-effort metadata for the UI; previously we awaited the relay
    // round-trip before addTrack, which let a racing remote offer trigger
    // an answer with no outgoing audio (causing "I see them but they can't
    // hear me" on the second joiner). The sender is what carries media —
    // get it onto the PC immediately, label it asynchronously.
    if (existing) {
      try { await existing.replaceTrack(track); } catch (e) { console.warn('[voice] replaceTrack failed', e); }
    } else {
      try {
        const sender = this.pc.addTrack(track);
        this.localSenders.set(kind, sender);
      } catch (e) {
        console.warn('[voice] addTrack failed', e);
        return;
      }
    }
    // Encoder caps (bitrate/framerate) are applied from `onconnectionstatechange`
    // when state hits 'connected', and again whenever the user changes quality.
    // Calling setParameters here can throw on Safari/Android during negotiation.

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
      }
    } catch (e) {
      console.error('[voice] kickNegotiation failed', e);
    } finally {
      this.makingOffer = false;
    }
  }

  /**
   * Handle an incoming signaling payload from the remote peer. Implements
   * the MDN perfect-negotiation pattern: polite side rolls back on glare;
   * impolite side ignores the conflicting remote offer.
   */
  async handleSignal(payload: VoiceSignalPayload): Promise<void> {
    if (this.closed) return;

    if (payload.trackInfo) {
      this.remoteTrackKinds.set(payload.trackInfo.trackId, payload.trackInfo.kind);
    }

    try {
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
          try {
            await this.pc.addIceCandidate(cand);
          } catch (err) {
            if (!this.ignoreOffer) console.warn('[voice] addIceCandidate failed', err);
          }
        }
      } else if (payload.type === 'bye') {
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

  /** Apply current caps (local pick ∩ remote hint) to the video sender. */
  private async applyVideoSenderParams(): Promise<void> {
    const sender = this.localSenders.get('camera') ?? this.localSenders.get('screen');
    if (!sender) return;
    const localBitrate = this.localVideoCap?.maxBitrate ?? null;
    const remoteBitrate = this.inboundCap?.maxBitrate ?? null;
    const bitrate = pickMin(localBitrate, remoteBitrate);
    const localFps = this.localVideoCap?.maxFramerate ?? null;
    const remoteFps = this.inboundCap?.maxFramerate ?? null;
    const fps = pickMin(localFps, remoteFps);
    // No caps to apply (pure 'auto' on both ends) — skip setParameters
    // entirely so we don't poke browser-quirky paths for a no-op.
    if (bitrate == null && fps == null) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      const enc = params.encodings[0];
      if (bitrate != null) enc.maxBitrate = bitrate;
      else delete enc.maxBitrate;
      if (fps != null) enc.maxFramerate = fps;
      else delete enc.maxFramerate;
      // Don't touch scaleResolutionDownBy or degradationPreference — both
      // have caused InvalidModificationError on Safari/Android in the wild.
      await sender.setParameters(params);
    } catch (e) {
      console.warn('[voice] setParameters failed', e);
    }
  }

  /** Apply the high-quality audio bitrate cap on the audio sender. Called by the
   *  client right after addTrack so the encoder sees the cap before the first
   *  RTP packet. */
  async applyAudioSenderParams(): Promise<void> {
    const sender = this.localSenders.get('audio');
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = AUDIO_MAX_BITRATE;
      // priority/networkPriority hints removed — Safari rejects unknown
      // encoding fields with InvalidAccessError on some builds.
      await sender.setParameters(params);
    } catch (e) {
      console.warn('[voice] audio setParameters failed', e);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.statsMonitor) { this.statsMonitor.stop(); this.statsMonitor = null; }
    void this.sendSignal({
      type: 'bye',
      sessionId: this.sessionId,
      seq: ++this.outboundSeq,
    }).catch(() => {});
    try { this.pc.close(); } catch { /* ignore */ }
  }
}

function pickMin(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}
