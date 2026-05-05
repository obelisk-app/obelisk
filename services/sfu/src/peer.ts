/**
 * One werift `RTCPeerConnection` per remote browser peer in a Room.
 *
 * Mirrors obelisk-dex/src/lib/voice/peer.ts at a structural level: per-peer
 * PC, kind-25050 SDP/ICE round-trips, sequence-numbered ICE batches,
 * out-of-band trackInfo. The browser code on the other end is identical
 * to the mesh path — that's the whole point of SFU-as-just-a-peer.
 *
 * Differences from the browser-side peer:
 *
 *   - **No rollback.** werift's setLocalDescription doesn't accept a
 *     'rollback' type. We avoid the need for it by being IMPOLITE in
 *     every SFU↔peer pair: on glare (offer collision) we drop the
 *     remote offer; the browser's perfect-negotiation rolls back its
 *     own offer if it's polite. If the browser is also impolite for
 *     this pair (browser_pk < sfu_pk) glare can stall — in practice
 *     it self-resolves on the next negotiation trigger because both
 *     sides only re-offer on track changes, not in tight loops.
 *
 *   - **Track lifecycle is coarse.** v0 treats forwarded tracks as
 *     alive until the originating peer's PC disconnects. A browser
 *     toggling camera-off mid-call will renegotiate (the transceiver
 *     goes to 'inactive'); we don't yet propagate that to the other
 *     forwarders. Punch-list — see docs/sfu-system.md §10.
 *
 *   - **No reconnect ladder.** On `'failed'` we close the PC and rely
 *     on the browser to redial. The browser already has the ladder.
 */
import {
  RTCPeerConnection,
  type MediaStreamTrack,
  type RTCRtpSender,
  type RTCRtpTransceiver,
  type RTCIceServer,
} from 'werift';

import { createLogger } from './log.js';
import type { Hex, VoiceSignalPayload, VoiceTrackKind } from './types.js';

const log = createLogger('peer');

export interface PeerOptions {
  remotePubkey: Hex;
  selfPubkey: Hex;
  iceServers: RTCIceServer[];
  publicIp: string | null;
  rtpPortMin: number;
  rtpPortMax: number;
  send: (payload: VoiceSignalPayload) => Promise<void> | void;
  events: PeerEvents;
}

export interface PeerEvents {
  onConnected(): void;
  onDisconnected(): void;
  onTrack(track: MediaStreamTrack, kind: VoiceTrackKind): void;
  onTrackEnded(trackId: string): void;
}

function fallbackKind(rawKind: 'audio' | 'video'): VoiceTrackKind {
  return rawKind === 'audio' ? 'audio' : 'camera';
}

interface ForwardedSender {
  originPubkey: Hex;
  trackId: string;
  trackKind: VoiceTrackKind;
  sender: RTCRtpSender;
  transceiver: RTCRtpTransceiver;
}

export class Peer {
  readonly remotePubkey: Hex;
  readonly sessionId: string;

  private readonly pc: RTCPeerConnection;
  private readonly events: PeerEvents;
  private readonly send: PeerOptions['send'];

  /** True while we have an outstanding `setLocalDescription` (offer). */
  private makingOffer = false;
  private outboundSeq = 0;

  /**
   * Outstanding offer-ack watchdog. Armed each time we send an offer
   * (forwarding a new track to this peer). The kind 25050 answer can
   * drop on the relay or never get answered if the recipient is
   * temporarily wedged; resending the same SDP is the cheapest recovery.
   */
  private offerAckTimer: ReturnType<typeof setTimeout> | null = null;
  private offerRetryAttempts = 0;

  /** trackId → kind, populated by inbound trackinfo events. */
  private remoteTrackKinds = new Map<string, VoiceTrackKind>();
  /** trackId → ForwardedSender, the senders we added to forward another peer's track. */
  private forwardedSenders = new Map<string, ForwardedSender>();

  /**
   * Debounce timer for `onnegotiationneeded` — see attachListeners. Multiple
   * synchronous addTransceiver calls collapse into a single offer.
   */
  private negotiationTimer: ReturnType<typeof setTimeout> | null = null;

  private wasConnected = false;
  private closed = false;
  /**
   * ICE-restart attempts done so far on this PC. Capped at
   * `ICE_RESTART_LIMIT`; beyond that we close and let the browser
   * redial. Mirrors the browser-side ladder in spirit (the browser
   * does ICE restart → hard reset; we do ICE restart → close).
   */
  private iceRestartCount = 0;
  /**
   * Inbound track ids currently delivered by this peer over a recv-able
   * transceiver. Used by the post-renegotiation diff to detect when a
   * peer has dropped a sender (camera off, screen-share ended) so we
   * can stop forwarding their now-dead track to other room members.
   */
  private inboundTrackIds = new Set<string>();

  constructor(opts: PeerOptions) {
    this.remotePubkey = opts.remotePubkey;
    this.events = opts.events;
    this.send = opts.send;
    this.sessionId = randomSessionId();

    // SFU_FORCE_RELAY=1 forces iceTransportPolicy: 'relay' so the SFU
    // ONLY uses TURN candidates. Useful when the cloud network blocks
    // direct inbound UDP on the configured RTP port range (the SFU
    // never receives a packet on its host candidate, ICE never
    // succeeds, peers loop on requestReset). Forcing relay routes the
    // media browser ↔ TURN ↔ SFU which only requires outbound UDP.
    const forceRelay = (process.env.SFU_FORCE_RELAY ?? '').trim() === '1';
    this.pc = new RTCPeerConnection({
      iceServers: opts.iceServers,
      bundlePolicy: 'max-bundle',
      iceTransportPolicy: forceRelay ? 'relay' : 'all',
      // werift port range — pin RTP to the configured range so a host
      // firewall / cloud security group can pinhole exactly these ports.
      icePortRange: [opts.rtpPortMin, opts.rtpPortMax],
      // Disable IPv6: our coturn listens on IPv4 only, so any v6 host
      // candidate the browser tries to permission gets a 403 Forbidden IP
      // back from coturn (it can't relay to v6 peers when listening on v4).
      iceUseIpv6: false,
      // Advertise this as a candidate when set — needed for 1:1 NAT
      // hosts (AWS, GCP) where the host can't see its own public IP.
      ...(opts.publicIp && !forceRelay ? { iceAdditionalHostAddresses: [opts.publicIp] } : {}),
    } as ConstructorParameters<typeof RTCPeerConnection>[0]);

    this.attachListeners();
    log.info('peer constructed', {
      remote: this.remotePubkey.slice(0, 8),
      sessionId: this.sessionId,
    });
  }

  // ── public API ─────────────────────────────────────────────────────────

  async forwardTrack(
    track: MediaStreamTrack,
    originPubkey: Hex,
    kind: VoiceTrackKind,
  ): Promise<void> {
    if (this.closed) return;
    if (originPubkey === this.remotePubkey) return; // never echo back

    const inboundTrackId = trackIdOf(track);

    // Use addTransceiver (well-tested werift idiom) instead of addTrack
    // (which is marked TODO in werift's source). `kind` here is the
    // VOICE-LEVEL kind ('audio' / 'camera' / 'screen' / 'screen-audio');
    // werift's transceiver wants the RAW media kind ('audio' / 'video').
    const rawKind: 'audio' | 'video' =
      kind === 'audio' || kind === 'screen-audio' ? 'audio' : 'video';
    const transceiver = this.pc.addTransceiver(rawKind, { direction: 'sendonly' });
    await transceiver.sender.replaceTrack(track);

    // werift's addTransceiver mints a fresh sender-side track id (visible to
    // the browser via SDP MSID) that does NOT equal the inbound track's id.
    // The browser's ontrack receives the sender id, so trackinfo MUST use
    // that id — otherwise the dex can't map the forwarded track back to its
    // origin pubkey and the tile stays empty / mis-attributed.
    const trackId = transceiver.sender.track?.id ?? inboundTrackId;

    // Out-of-band trackinfo so the browser's ontrack handler has the
    // kind+origin lookup ready when the inbound track materializes.
    await this.send({
      type: 'trackinfo',
      trackInfo: {
        trackId,
        kind,
        originPubkey,
      },
      sessionId: this.sessionId,
      seq: this.outboundSeq++,
    });

    this.forwardedSenders.set(trackId, {
      originPubkey,
      trackId,
      trackKind: kind,
      sender: transceiver.sender,
      transceiver,
    });
    log.info('forwarded track added', {
      to: this.remotePubkey.slice(0, 8),
      from: originPubkey.slice(0, 8),
      trackInfoId: trackId,
      senderTrackId: transceiver.sender.track?.id,
      senderTrackUuid: (transceiver.sender.track as { uuid?: string } | null | undefined)?.uuid,
      kind,
    });

    // werift triggers `onnegotiationneeded` after addTransceiver; our
    // handler creates and sends the offer. If a negotiation is already
    // in flight, makingOffer suppresses the duplicate.
  }

  async stopForwardingTrack(originPubkey: Hex, trackId: string): Promise<void> {
    if (this.closed) return;
    const entry = this.forwardedSenders.get(trackId);
    if (!entry || entry.originPubkey !== originPubkey) return;

    try {
      // Drop the underlying track. werift's removeTrack expects a sender
      // returned from addTrack/addTransceiver; we kept the sender in the
      // entry. If werift's removeTrack is incomplete for our path,
      // replaceTrack(null) at least stops RTP egress.
      await entry.sender.replaceTrack(null);
      try {
        this.pc.removeTrack(entry.sender);
      } catch (innerErr) {
        log.debug('pc.removeTrack threw (continuing)', {
          err: (innerErr as Error).message,
        });
      }
    } catch (err) {
      log.debug('replaceTrack(null) threw (peer likely closed)', {
        err: (err as Error).message,
      });
    }
    this.forwardedSenders.delete(trackId);
    log.debug('forwarded track removed', {
      to: this.remotePubkey.slice(0, 8),
      from: originPubkey.slice(0, 8),
      trackId,
    });
  }

  async handleSignal(payload: VoiceSignalPayload): Promise<void> {
    if (this.closed) return;

    try {
      switch (payload.type) {
        case 'offer':
          return await this.handleOffer(payload);
        case 'answer':
          return await this.handleAnswer(payload);
        case 'ice':
          return await this.handleIce(payload);
        case 'trackinfo':
          if (payload.trackInfo) {
            this.remoteTrackKinds.set(payload.trackInfo.trackId, payload.trackInfo.kind);
          }
          return;
        case 'bye':
          log.info('peer bye', { remote: this.remotePubkey.slice(0, 8) });
          this.close();
          return;
        case 'requestReset':
          // Polite peer asking us to rebuild. v0: just close and wait
          // for redial. The browser's reconnect ladder kicks in.
          log.info('requestReset → closing for redial', {
            remote: this.remotePubkey.slice(0, 8),
          });
          this.close();
          return;
        case 'qualityhint':
          // v0 doesn't dynamically adjust outbound encoding params.
          return;
      }
    } catch (err) {
      log.warn('signal handler threw', {
        type: payload.type,
        remote: this.remotePubkey.slice(0, 8),
        err: (err as Error).message,
      });
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearOfferAckWatchdog();
    if (this.negotiationTimer) { clearTimeout(this.negotiationTimer); this.negotiationTimer = null; }
    try {
      void this.pc.close();
    } catch (err) {
      log.debug('pc.close threw (ignored)', { err: (err as Error).message });
    }
    // Fire onDisconnected unconditionally — Room uses this callback to
    // remove the peer from its `peers` map. If we only fired on the
    // connected→disconnected edge, a peer that was constructed but never
    // reached 'connected' (e.g. closed by `requestReset`) would stay in
    // the map indefinitely and silently swallow subsequent offers.
    this.wasConnected = false;
    this.events.onDisconnected();
    log.info('peer closed', { remote: this.remotePubkey.slice(0, 8) });
  }

  // ── internal ───────────────────────────────────────────────────────────

  private attachListeners(): void {
    // Werift exposes some events as callback properties (browser-style)
    // and others as observables (`Event<T>` with .subscribe()). Use the
    // shape each one publishes — mixing styles isn't a typo.

    this.pc.onnegotiationneeded = () => {
      // Coalesce: a peer joining with N forwarded tracks fires
      // onnegotiationneeded N times in quick succession (one per
      // addTransceiver). Without debounce werift sends N separate offers,
      // each with a different m-line count, and the browser rejects the
      // later ones with "order of m-lines doesn't match". One offer with
      // all transceivers fixes that.
      if (this.negotiationTimer) clearTimeout(this.negotiationTimer);
      this.negotiationTimer = setTimeout(() => {
        this.negotiationTimer = null;
        void this.makeOffer().catch((err) =>
          log.warn('makeOffer threw', { err: (err as Error).message }),
        );
      }, 50);
    };
    this.pc.onIceCandidate.subscribe((candidate) => {
      if (!candidate) return; // null = end-of-candidates
      // `send` may be sync (returns void) or async (returns Promise);
      // wrap in Promise.resolve so the .catch lands either way.
      Promise.resolve(
        this.send({
          type: 'ice',
          candidates: [candidate.toJSON()],
          sessionId: this.sessionId,
          seq: this.outboundSeq++,
        }),
      ).catch((err) =>
        log.debug('ice send failed', { err: (err as Error).message }),
      );
    });

    this.pc.onTrack.subscribe((track) => {
      if (!track) return;
      const tid = trackIdOf(track);
      const kind = this.remoteTrackKinds.get(tid) ?? fallbackKind(track.kind as 'audio' | 'video');
      this.inboundTrackIds.add(tid);
      log.info('inbound track', {
        from: this.remotePubkey.slice(0, 8),
        trackId: tid,
        kind,
      });
      this.events.onTrack(track, kind);
      // Mid-PC track ends are detected post-renegotiation in
      // `diffInboundAfterRenegotiation`; tracks also get cleared when the
      // whole peer disconnects (handled by Room.dropPeer).
    });

    this.pc.connectionStateChange.subscribe((state) => {
      log.debug('connection state', { remote: this.remotePubkey.slice(0, 8), state });
      if (state === 'connected') {
        // Successful (re)connect resets the restart counter so a future
        // hiccup gets a fresh budget.
        this.iceRestartCount = 0;
        if (!this.wasConnected) {
          this.wasConnected = true;
          this.events.onConnected();
        }
        return;
      }
      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        if (this.wasConnected) {
          this.wasConnected = false;
          this.events.onDisconnected();
        }
        if (state === 'failed') {
          this.escalateOnFailed();
        }
      }
    });
  }

  /**
   * Reconnect ladder: try ICE restart up to `ICE_RESTART_LIMIT` times,
   * then close. werift's `restartIce()` flips the local ICE credentials
   * and triggers a fresh negotiationneeded; the browser's perfect-
   * negotiation handles the resulting offer. Closing on exhaustion lets
   * the browser-side reconnect ladder drive a full rebuild.
   */
  private escalateOnFailed(): void {
    if (this.closed) return;
    const ICE_RESTART_LIMIT = 3;
    if (this.iceRestartCount < ICE_RESTART_LIMIT) {
      this.iceRestartCount++;
      log.info('peer failed — ICE restart', {
        remote: this.remotePubkey.slice(0, 8),
        attempt: this.iceRestartCount,
        limit: ICE_RESTART_LIMIT,
      });
      try {
        this.pc.restartIce();
      } catch (err) {
        log.warn('restartIce threw', {
          remote: this.remotePubkey.slice(0, 8),
          err: (err as Error).message,
        });
        this.close();
      }
      return;
    }
    log.info('peer failed — restart budget exhausted, closing for redial', {
      remote: this.remotePubkey.slice(0, 8),
    });
    this.close();
  }

  private async makeOffer(): Promise<void> {
    if (this.closed) return;
    if (this.pc.signalingState !== 'stable') {
      // We're in the middle of negotiation — let the current round-trip
      // finish; the browser's answer flips us back to stable and the
      // negotiationneeded that fires after this addTrack will already
      // be queued.
      return;
    }
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      const sdp = this.pc.localDescription?.sdp;
      if (!sdp) {
        log.warn('makeOffer: no localDescription after setLocalDescription');
        return;
      }
      const lines = sdp.split('\n');
      const codecs = lines
        .filter((l) => l.startsWith('a=rtpmap:'))
        .map((l) => l.trim());
      log.info('offer rtpmap', {
        remote: this.remotePubkey.slice(0, 8),
        codecs,
      });
      await this.send({
        type: 'offer',
        sdp,
        sessionId: this.sessionId,
        seq: this.outboundSeq++,
      });
      this.armOfferAckWatchdog();
    } finally {
      this.makingOffer = false;
    }
  }

  /**
   * Arm a watchdog so a forwarded-track offer that gets dropped on the
   * relay (or whose answer is dropped on the way back) is resent
   * automatically. Without this, an unlucky relay drop means the
   * recipient never sees the new track and the room looks "broken"
   * (audio works, video doesn't). The dex client's symmetric watchdog
   * lives in src/lib/voice/peer.ts.
   *
   * Only arms post-connect — initial-handshake stuck cases are
   * handled by the connection-state recovery path (failed/disconnected
   * → ICE restart → close-for-redial).
   *
   * 8 s gives the recipient enough time to receive offer + apply +
   * craft answer + publish + relay-deliver. We resend the same SDP up
   * to OFFER_RETRY_LIMIT_SFU times before giving up; the connection
   * itself stays healthy and other tracks continue to flow, so a hard
   * reset would be net-negative.
   */
  private armOfferAckWatchdog(): void {
    if (this.closed) return;
    if (!this.wasConnected) return;
    if (this.offerAckTimer) clearTimeout(this.offerAckTimer);
    const OFFER_ACK_TIMEOUT_MS = 8000;
    const OFFER_RETRY_LIMIT_SFU = 2;
    this.offerAckTimer = setTimeout(() => {
      this.offerAckTimer = null;
      if (this.closed) return;
      if (this.pc.signalingState !== 'have-local-offer') {
        this.offerRetryAttempts = 0;
        return;
      }
      this.offerRetryAttempts += 1;
      if (this.offerRetryAttempts > OFFER_RETRY_LIMIT_SFU) {
        log.warn('forward offer never acked; giving up resends', {
          remote: this.remotePubkey.slice(0, 8),
          attempts: this.offerRetryAttempts,
        });
        this.offerRetryAttempts = 0;
        return;
      }
      log.warn('forward offer not acked, resending', {
        remote: this.remotePubkey.slice(0, 8),
        attempt: this.offerRetryAttempts,
      });
      void this.resendCurrentOffer();
    }, OFFER_ACK_TIMEOUT_MS);
  }

  private clearOfferAckWatchdog(): void {
    if (this.offerAckTimer) {
      clearTimeout(this.offerAckTimer);
      this.offerAckTimer = null;
    }
    this.offerRetryAttempts = 0;
  }

  private async resendCurrentOffer(): Promise<void> {
    if (this.closed) return;
    const desc = this.pc.localDescription;
    if (!desc || desc.type !== 'offer') return;
    try {
      await this.send({
        type: 'offer',
        sdp: desc.sdp,
        sessionId: this.sessionId,
        seq: this.outboundSeq++,
      });
    } finally {
      this.armOfferAckWatchdog();
    }
  }

  private async handleOffer(payload: VoiceSignalPayload): Promise<void> {
    if (!payload.sdp) return;

    // Glare: if we're mid-offer or have a local-offer pending, we drop
    // the remote offer. werift can't roll back, so we play impolite.
    // Browser perfect-negotiation handles this when browser is polite
    // (browser_pk > sfu_pk) — it rolls its own offer back.
    if (this.makingOffer || this.pc.signalingState !== 'stable') {
      log.debug('drop remote offer (glare)', {
        remote: this.remotePubkey.slice(0, 8),
        state: this.pc.signalingState,
      });
      return;
    }

    await this.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
    // Detect tracks the remote stopped sending in this renegotiation
    // (camera-off, screen-stop). Run AFTER setRemoteDescription so the
    // transceivers reflect the new direction set, but BEFORE we publish
    // the answer so the room is in sync when the next forwardTrack fires.
    this.diffInboundAfterRenegotiation();
    await this.pc.setLocalDescription(); // produces answer
    const answerSdp = this.pc.localDescription?.sdp;
    if (!answerSdp) {
      log.warn('handleOffer: no answer SDP produced');
      return;
    }
    await this.send({
      type: 'answer',
      sdp: answerSdp,
      sessionId: this.sessionId,
      seq: this.outboundSeq++,
    });
  }

  /**
   * Compare the post-renegotiation transceiver set against tracks we
   * believed were live and fire `onTrackEnded` for any that the peer
   * stopped sending. werift exposes `transceiver.currentDirection` as
   * the last-negotiated direction — a transceiver that flipped to
   * 'inactive' or 'sendonly' (from our PoV the peer stopped sending)
   * means that track is gone.
   *
   * We can't always rely on `track.stopped` because werift sometimes
   * keeps the receiver track object alive across renegotiations.
   * Direction is the spec-compliant signal.
   */
  private diffInboundAfterRenegotiation(): void {
    if (this.inboundTrackIds.size === 0) return;
    const stillRecv = new Set<string>();
    try {
      for (const tx of this.pc.getTransceivers()) {
        const dir = tx.currentDirection ?? tx.direction;
        if (dir !== 'recvonly' && dir !== 'sendrecv') continue;
        const t = tx.receiver?.track;
        if (!t) continue;
        const tid = trackIdOf(t);
        stillRecv.add(tid);
      }
    } catch (err) {
      // werift API surface drifts across versions; fail open rather than
      // leaving the room in a stuck state if we can't introspect.
      log.debug('transceiver diff threw — skipping', {
        err: (err as Error).message,
      });
      return;
    }
    for (const tid of Array.from(this.inboundTrackIds)) {
      if (!stillRecv.has(tid)) {
        this.inboundTrackIds.delete(tid);
        log.info('inbound track ended via renegotiation', {
          from: this.remotePubkey.slice(0, 8),
          trackId: tid,
        });
        this.events.onTrackEnded(tid);
      }
    }
  }

  private async handleAnswer(payload: VoiceSignalPayload): Promise<void> {
    if (!payload.sdp) return;
    if (this.pc.signalingState !== 'have-local-offer') {
      log.debug('drop answer: wrong signaling state', {
        state: this.pc.signalingState,
      });
      return;
    }
    await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
    // Successful application clears the offer-ack watchdog — werift
    // doesn't expose `onsignalingstatechange`, so we wire it here.
    this.clearOfferAckWatchdog();
  }

  private async handleIce(payload: VoiceSignalPayload): Promise<void> {
    const cands = payload.candidates ?? [];
    for (const c of cands) {
      try {
        // werift's addIceCandidate is strict about undefined fields
        // (its RTCIceCandidateInit uses `string | null`). Browser
        // toJSON output uses `null` for unset, so normalize either way:
        // drop fields that are undefined, keep fields that are null.
        const init: {
          candidate?: string;
          sdpMid?: string | null;
          sdpMLineIndex?: number | null;
          usernameFragment?: string | null;
        } = {};
        if (c.candidate !== undefined) init.candidate = c.candidate;
        if (c.sdpMid !== undefined) init.sdpMid = c.sdpMid;
        if (c.sdpMLineIndex !== undefined) init.sdpMLineIndex = c.sdpMLineIndex;
        if (c.usernameFragment !== undefined) init.usernameFragment = c.usernameFragment;
        await this.pc.addIceCandidate(init);
      } catch (err) {
        // ICE candidates can race the SDP — werift may throw if the
        // remote description isn't applied yet. Drop and continue.
        log.debug('addIceCandidate failed (often benign)', {
          err: (err as Error).message,
        });
      }
    }
  }
}

/**
 * werift's MediaStreamTrack has both `id?: string` and `uuid: string`.
 * `id` is set when negotiated via SDP; `uuid` is always present. Prefer
 * `id` for parity with the browser's track.id (which is what trackInfo
 * payloads carry), fall back to `uuid` so we always have a stable key.
 */
function trackIdOf(track: MediaStreamTrack): string {
  return track.id ?? track.uuid;
}

function randomSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}
