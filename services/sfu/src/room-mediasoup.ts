/**
 * Mediasoup-backed Room. One per active SFU call.
 *
 * Holds:
 *   - Exactly one mediasoup Router for the channel (lazy-allocated).
 *   - Per-pubkey RecvTransport + SendTransport pair (created on first
 *     `createWebRtcTransport` request from that peer).
 *   - The producer table: every track ingressed from any peer, indexed
 *     by Producer.id. New consumers get an auto-`consume()` for each
 *     existing producer (that isn't their own) on next request.
 *
 * Differences from the werift Room:
 *   - No `forwardTrack()` — the engine pushes Producers and clients pull
 *     them via `consume`. The bridge sends `newProducer` notifications
 *     so clients know to call back.
 *   - No m-line ordering / glare hacks — mediasoup negotiates per-transport
 *     once and then runs RPC for producer/consumer add/remove without
 *     touching SDP.
 *   - No PT remap, no codec preference shimming. The Router advertises a
 *     fixed codec list (audio/opus + video/VP8|VP9|H264) and the client
 *     `Device.load(rtpCapabilities)` agrees ahead of time.
 */
import type { types as ms } from 'mediasoup';

import { canDialRoom } from './auth.js';
import { KIND_SFU_ACTIVE_CALL, KIND_VOICE_SIGNAL } from './nip-kinds.js';
import { createLogger } from './log.js';
import { publishSfuBeacon } from './signaling.js';
import { dispatchRequest, parseEnvelope, RpcError } from './nostr-rpc.js';
import type { RpcContext, RpcHandlerMap, RpcNotification } from './nostr-rpc.js';
import type { Config } from './config.js';
import type { MediasoupEngine } from './mediasoup-server.js';
import type { MembershipTracker } from './membership.js';
import type { RelayPool } from './relay.js';
import type { Hex, RoomRules, RoomSnapshot, RoomStatus } from './types.js';

const log = createLogger('room-ms');

const BEACON_INTERVAL_MS = 15_000;
const ACTIVE_CALL_INTERVAL_MS = 60_000;
const ACTIVE_CALL_TTL_SECONDS = 90;

export interface MediasoupRoomOptions {
  channelId: string;
  hostPubkey: Hex;
  rules: RoomRules;
  cfg: Config;
  engine: MediasoupEngine;
  relay: RelayPool;
  membership: MembershipTracker;
  onClosed: (channelId: string) => void;
}

interface PeerState {
  pubkey: Hex;
  /** WebRTC transport the peer publishes to (browser → SFU media). */
  sendTransport?: ms.WebRtcTransport;
  /** WebRTC transport the SFU pushes media on (SFU → browser). */
  recvTransport?: ms.WebRtcTransport;
  /** Producers this peer has open on its sendTransport. */
  producers: Map<string, ms.Producer>;
  /** Consumers we created on the peer's recvTransport (key: producerId). */
  consumers: Map<string, ms.Consumer>;
  /** Voice-level metadata per producer (camera vs screen, origin, etc.). */
  producerAppData: Map<string, { kind: 'audio' | 'camera' | 'screen' | 'screen-audio'; originPubkey: Hex }>;
}

export class MediasoupRoom {
  private readonly channelId: string;
  readonly hostPubkey: Hex;
  // Mutable so `updateRules` can swap in a new ruleset while the room is
  // alive (host changes camera/screen permission mid-call).
  private _rules: RoomRules;
  private readonly cfg: Config;
  private readonly engine: MediasoupEngine;
  private readonly relay: RelayPool;
  private readonly membership: MembershipTracker;
  private readonly onClosed: (channelId: string) => void;

  private router: ms.Router | null = null;
  private readonly peers = new Map<Hex, PeerState>();

  private signalUnsub: (() => void) | null = null;
  private membershipRelease: (() => void) | null = null;

  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  private activeCallTimer: ReturnType<typeof setInterval> | null = null;

  private _status: RoomStatus = 'starting';
  private startedAt = 0;

  constructor(opts: MediasoupRoomOptions) {
    this.channelId = opts.channelId;
    this.hostPubkey = opts.hostPubkey;
    this._rules = opts.rules;
    this.cfg = opts.cfg;
    this.engine = opts.engine;
    this.relay = opts.relay;
    this.membership = opts.membership;
    this.onClosed = opts.onClosed;
  }

  get status(): RoomStatus {
    return this._status;
  }

  /** Read-only rules accessor — call-listener uses this for `updateRules`. */
  get rules(): RoomRules {
    return this._rules;
  }

  /**
   * Replace the active ruleset. Most fields take effect on the next dial
   * gate check; v1 doesn't proactively renegotiate when, e.g., `video` is
   * flipped to false (consumers stay open until the producer is closed
   * separately). That parity gap with the werift Room is acceptable for
   * v1 because the host UI flips both rules + producer in tandem.
   */
  updateRules(rules: RoomRules): void {
    this._rules = rules;
  }

  /**
   * Test-only: inject a producer fed by an external RTP source (typically
   * ffmpeg). Creates a `PlainTransport` on the room's router, returns the
   * RTP/RTCP listening address + the SSRC + payload type the caller should
   * use. Producers get a synthetic origin pubkey so browsers attribute
   * the track to "test peer" in their UI.
   *
   * Use case: end-to-end smoke test of the mediasoup pipeline without
   * needing a real browser publisher. Once mediasoup-client validation is
   * complete this can stay around for load tests / regression testing.
   */
  async injectTestProducer(opts: {
    kind: 'audio' | 'video';
    voiceKind: 'audio' | 'camera' | 'screen' | 'screen-audio';
    originPubkey: Hex;
  }): Promise<{
    transportId: string;
    rtpListenIp: string;
    rtpListenPort: number;
    rtcpListenPort: number;
    payloadType: number;
    ssrc: number;
    producerId: string;
  }> {
    if (!this.router) throw new Error('router not ready');
    const isVideo = opts.kind === 'video';
    const payloadType = isVideo ? 101 : 100; // matches mediasoup-server.ts preferredPayloadType
    const ssrc = isVideo ? 22220001 : 22220002;
    const codec = isVideo
      ? { mimeType: 'video/VP8', payloadType, clockRate: 90000 }
      : { mimeType: 'audio/opus', payloadType, clockRate: 48000, channels: 2 };

    const listenIp = this.cfg.publicIp
      ? { ip: '0.0.0.0', announcedIp: this.cfg.publicIp }
      : { ip: '0.0.0.0' };
    const transport = await this.router.createPlainTransport({
      listenIp,
      rtcpMux: false,
      comedia: true, // bind remote address from first packet — caller doesn't need to set DTLS/connect
    });
    log.info('test inject transport', {
      channelId: this.channelId.slice(0, 8),
      kind: opts.kind,
      transportId: transport.id,
      rtp: `${transport.tuple.localIp}:${transport.tuple.localPort}`,
      rtcp: transport.rtcpTuple
        ? `${transport.rtcpTuple.localIp}:${transport.rtcpTuple.localPort}`
        : '(muxed)',
    });

    const producer = await transport.produce({
      kind: opts.kind,
      rtpParameters: {
        codecs: [codec],
        encodings: [{ ssrc }],
      },
    });

    // Stash a synthetic peer record so room snapshots / consumer-newProducer
    // notifications carry the right origin attribution. We don't add to
    // `this.peers` (no transports) — instead, broadcast a notification
    // directly to every existing recv-transport-bearing peer.
    const meta = { kind: opts.voiceKind, originPubkey: opts.originPubkey };
    for (const other of this.peers.values()) {
      if (!other.recvTransport) continue;
      void this.sendNotification(other.pubkey, 'newProducer', {
        producerId: producer.id,
        kind: producer.kind,
        appData: meta,
      });
    }
    // Also keep the producer alive: if the room closes we close it.
    // Track it on a synthetic peer record under the origin pubkey so
    // `consume` can find the appData.
    let synthetic = this.peers.get(opts.originPubkey);
    if (!synthetic) {
      synthetic = {
        pubkey: opts.originPubkey,
        producers: new Map(),
        consumers: new Map(),
        producerAppData: new Map(),
      };
      this.peers.set(opts.originPubkey, synthetic);
    }
    synthetic.producers.set(producer.id, producer);
    synthetic.producerAppData.set(producer.id, meta);

    return {
      transportId: transport.id,
      rtpListenIp: this.cfg.publicIp ?? transport.tuple.localIp,
      rtpListenPort: transport.tuple.localPort,
      rtcpListenPort: transport.rtcpTuple?.localPort ?? 0,
      payloadType,
      ssrc,
      producerId: producer.id,
    };
  }

  /**
   * Kick a participant: close their transports + producers + consumers,
   * publish an out-of-band notification so they know why. Idempotent —
   * a second kick on the same pubkey is a no-op.
   */
  async kick(targetPubkey: Hex, reason?: string): Promise<void> {
    const peer = this.peers.get(targetPubkey);
    if (!peer) return;
    log.info('kick', { target: targetPubkey.slice(0, 8), reason: reason ?? '' });
    try { peer.sendTransport?.close(); } catch { /* ignore */ }
    try { peer.recvTransport?.close(); } catch { /* ignore */ }
    this.peers.delete(targetPubkey);
    await this.sendNotification(targetPubkey, 'kicked', { reason: reason ?? null });
  }

  snapshot(): RoomSnapshot {
    return {
      channelId: this.channelId,
      status: this._status,
      hostPubkey: this.hostPubkey,
      rules: this._rules,
      participants: Array.from(this.peers.keys()),
      startedAt: this.startedAt,
    };
  }

  async start(): Promise<void> {
    log.info('room.start enter', { channelId: this.channelId.slice(0, 8) });
    if (this._status !== 'starting') {
      throw new Error(`room ${this.channelId.slice(0, 8)} already started`);
    }
    this.router = await this.engine.getRouter(this.channelId);
    log.info('room.start router ready', { channelId: this.channelId.slice(0, 8), routerId: this.router.id });
    this._status = 'active';
    this.startedAt = Math.floor(Date.now() / 1000);

    this.signalUnsub = this.relay.subscribe(
      {
        kinds: [KIND_VOICE_SIGNAL],
        '#e': [this.channelId],
        since: Math.floor(Date.now() / 1000) - 60,
      },
      (ev) => {
        if (ev.pubkey === this.relay.pubkey) return;
        const targets = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
        if (targets.length > 0 && !targets.includes(this.relay.pubkey)) return;
        this.handleEnvelope(ev.pubkey, ev.content).catch((err) =>
          log.warn('envelope handler threw', { err: (err as Error).message }),
        );
      },
    );
    log.info('room.start signal subscribed', { channelId: this.channelId.slice(0, 8) });

    const watch = this.membership.watch(this.channelId);
    this.membershipRelease = watch.release;
    log.info('room.start membership held', { channelId: this.channelId.slice(0, 8) });

    // Don't await beacon publishes — keeps room.start() fast even if the
    // relay write is slow. Periodic timers keep the beacon stream going.
    void this.publishBeacon().catch((err) => log.warn('beacon publish failed', { err: (err as Error).message }));
    void this.publishActiveCall().catch((err) => log.warn('active-call publish failed', { err: (err as Error).message }));
    this.beaconTimer = setInterval(() => {
      void this.publishBeacon().catch(() => undefined);
    }, BEACON_INTERVAL_MS);
    this.activeCallTimer = setInterval(() => {
      void this.publishActiveCall().catch(() => undefined);
    }, ACTIVE_CALL_INTERVAL_MS);

    log.info('room started', {
      channelId: this.channelId.slice(0, 8),
      host: this.hostPubkey.slice(0, 8),
      routerId: this.router.id,
    });
  }

  async close(): Promise<void> {
    if (this._status === 'closed') return;
    this._status = 'closed';

    if (this.beaconTimer) { clearInterval(this.beaconTimer); this.beaconTimer = null; }
    if (this.activeCallTimer) { clearInterval(this.activeCallTimer); this.activeCallTimer = null; }
    this.signalUnsub?.();
    this.signalUnsub = null;

    // Close every peer's transports — mediasoup will close their producers
    // and consumers automatically. Clients see the transport drop.
    for (const peer of this.peers.values()) {
      try { peer.sendTransport?.close(); } catch { /* ignore */ }
      try { peer.recvTransport?.close(); } catch { /* ignore */ }
    }
    this.peers.clear();

    await this.engine.closeRouter(this.channelId).catch(() => undefined);
    this.router = null;

    await this.publishActiveCall().catch(() => undefined);
    this.membershipRelease?.();
    this.membershipRelease = null;
    this.onClosed(this.channelId);

    log.info('room closed', { channelId: this.channelId.slice(0, 8) });
  }

  // ── envelope intake ────────────────────────────────────────────────────

  private async handleEnvelope(fromPubkey: Hex, content: string): Promise<void> {
    if (this._status !== 'active') return;
    const envelope = parseEnvelope(content);
    if (!envelope) {
      // Either malformed or a legacy werift SDP/ICE payload — drop silently.
      // Mixed-engine support is not a goal: when SFU_ENGINE=mediasoup, only
      // mediasoup-aware clients work.
      return;
    }
    if (envelope.type !== 'request') {
      // Responses / notifications travel server → client; any inbound
      // response is from a confused legacy client. Ignore.
      return;
    }
    log.info('rpc request', {
      from: fromPubkey.slice(0, 8),
      method: envelope.method,
      requestId: envelope.requestId.slice(0, 8),
    });

    const decision = canDialRoom({
      rules: this._rules,
      members: this.membership.getMembers(this.channelId),
      hostPubkey: this.hostPubkey,
      sender: fromPubkey,
    });
    if (!decision.ok) {
      log.debug('rpc refused at door', {
        from: fromPubkey.slice(0, 8),
        reason: decision.reason,
      });
      return;
    }

    const ctx: RpcContext = {
      channelId: this.channelId,
      fromPubkey,
      notify: (method, data) => this.sendNotification(fromPubkey, method, data),
    };
    const response = await dispatchRequest(this.handlers, ctx, envelope);
    await this.sendResponse(fromPubkey, response);
  }

  private async sendResponse(toPubkey: Hex, response: unknown): Promise<void> {
    await this.relay.publish({
      kind: KIND_VOICE_SIGNAL,
      content: JSON.stringify(response),
      tags: [
        ['p', toPubkey],
        ['e', this.channelId],
        ['t', 'obelisk-voice-signal'],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  private async sendNotification<T>(
    toPubkey: Hex,
    method: string,
    data?: T,
  ): Promise<void> {
    const notification: RpcNotification = data === undefined
      ? { type: 'notification', method }
      : { type: 'notification', method, data };
    await this.relay.publish({
      kind: KIND_VOICE_SIGNAL,
      content: JSON.stringify(notification),
      tags: [
        ['p', toPubkey],
        ['e', this.channelId],
        ['t', 'obelisk-voice-signal'],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  // ── method handlers ────────────────────────────────────────────────────

  private getOrCreatePeer(pubkey: Hex): PeerState {
    let p = this.peers.get(pubkey);
    if (!p) {
      const cap = this._rules.maxParticipants ?? this.cfg.maxParticipantsPerRoom;
      if (this.peers.size >= cap) {
        throw new RpcError('room full', 'ROOM_FULL');
      }
      p = {
        pubkey,
        producers: new Map(),
        consumers: new Map(),
        producerAppData: new Map(),
      };
      this.peers.set(pubkey, p);
    }
    return p;
  }

  /**
   * Method dispatch table. Handlers throw `RpcError` to surface a clean
   * error response; the dispatcher centralizes envelope shaping.
   */
  private readonly handlers: RpcHandlerMap = {
    getRouterRtpCapabilities: async () => {
      if (!this.router) throw new RpcError('router not ready', 'NO_ROUTER');
      return this.router.rtpCapabilities;
    },

    createWebRtcTransport: async (ctx, raw) => {
      if (!this.router) throw new RpcError('router not ready', 'NO_ROUTER');
      const data = (raw ?? {}) as { direction?: 'send' | 'recv' };
      const direction = data.direction === 'recv' ? 'recv' : 'send';
      const peer = this.getOrCreatePeer(ctx.fromPubkey);
      const existing = direction === 'send' ? peer.sendTransport : peer.recvTransport;
      if (existing) {
        // Idempotent — return the same transport's params if the client
        // re-asks (browser refresh, retry on dropped relay).
        return {
          id: existing.id,
          iceParameters: existing.iceParameters,
          iceCandidates: existing.iceCandidates,
          dtlsParameters: existing.dtlsParameters,
        };
      }
      const transport = await this.router.createWebRtcTransport(
        this.engine.webRtcTransportOptions(),
      );
      transport.on('dtlsstatechange', (state) => {
        if (state === 'closed') {
          log.debug('transport dtls closed', {
            peer: ctx.fromPubkey.slice(0, 8), direction, id: transport.id,
          });
        }
      });
      if (direction === 'send') peer.sendTransport = transport;
      else peer.recvTransport = transport;

      // When the peer's recv transport comes online, push notifications for
      // every existing producer so the client knows what to consume.
      if (direction === 'recv') {
        for (const other of this.peers.values()) {
          if (other.pubkey === ctx.fromPubkey) continue;
          for (const [, producer] of other.producers) {
            const meta = other.producerAppData.get(producer.id);
            void ctx.notify('newProducer', {
              producerId: producer.id,
              kind: producer.kind,
              appData: meta ?? null,
            });
          }
        }
      }

      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    },

    connectWebRtcTransport: async (ctx, raw) => {
      const data = raw as { transportId: string; dtlsParameters: ms.DtlsParameters };
      const peer = this.peers.get(ctx.fromPubkey);
      if (!peer) throw new RpcError('no peer state', 'NO_PEER');
      const transport = peer.sendTransport?.id === data.transportId
        ? peer.sendTransport
        : peer.recvTransport?.id === data.transportId
          ? peer.recvTransport
          : null;
      if (!transport) throw new RpcError('unknown transport', 'NO_TRANSPORT');
      await transport.connect({ dtlsParameters: data.dtlsParameters });
      return {};
    },

    produce: async (ctx, raw) => {
      const data = raw as {
        transportId: string;
        kind: ms.MediaKind;
        rtpParameters: ms.RtpParameters;
        appData?: { kind?: 'audio' | 'camera' | 'screen' | 'screen-audio' };
      };
      const peer = this.peers.get(ctx.fromPubkey);
      if (!peer) throw new RpcError('no peer state', 'NO_PEER');
      const transport = peer.sendTransport;
      if (!transport || transport.id !== data.transportId) {
        throw new RpcError('unknown send transport', 'NO_TRANSPORT');
      }
      const producer = await transport.produce({
        kind: data.kind,
        rtpParameters: data.rtpParameters,
      });
      const voiceKind = data.appData?.kind
        ?? (data.kind === 'audio' ? 'audio' : 'camera');
      peer.producers.set(producer.id, producer);
      peer.producerAppData.set(producer.id, {
        kind: voiceKind,
        originPubkey: ctx.fromPubkey,
      });
      log.info('producer created', {
        peer: ctx.fromPubkey.slice(0, 8),
        producerId: producer.id,
        kind: data.kind,
        voiceKind,
      });

      producer.on('transportclose', () => {
        peer.producers.delete(producer.id);
        peer.producerAppData.delete(producer.id);
      });

      // Tell every other peer with a recv transport about this new producer
      // so they can call `consume`.
      for (const other of this.peers.values()) {
        if (other.pubkey === ctx.fromPubkey) continue;
        if (!other.recvTransport) continue;
        void this.sendNotification(other.pubkey, 'newProducer', {
          producerId: producer.id,
          kind: producer.kind,
          appData: { kind: voiceKind, originPubkey: ctx.fromPubkey },
        });
      }
      return { id: producer.id };
    },

    consume: async (ctx, raw) => {
      const data = raw as { producerId: string; rtpCapabilities: ms.RtpCapabilities };
      const peer = this.peers.get(ctx.fromPubkey);
      if (!peer) throw new RpcError('no peer state', 'NO_PEER');
      if (!peer.recvTransport) throw new RpcError('recv transport not ready', 'NO_RECV_TRANSPORT');
      if (!this.router) throw new RpcError('no router', 'NO_ROUTER');
      if (!this.router.canConsume({ producerId: data.producerId, rtpCapabilities: data.rtpCapabilities })) {
        throw new RpcError('cannot consume — codec mismatch', 'CANNOT_CONSUME');
      }
      // Find producer to surface its appData (origin pubkey, voice-kind) to the client.
      let producerOwner: PeerState | null = null;
      for (const other of this.peers.values()) {
        if (other.producers.has(data.producerId)) { producerOwner = other; break; }
      }
      const meta = producerOwner?.producerAppData.get(data.producerId);

      const consumer = await peer.recvTransport.consume({
        producerId: data.producerId,
        rtpCapabilities: data.rtpCapabilities,
        // start paused; client resumes after attaching the track to its
        // <video> element to avoid losing initial frames in some browsers.
        paused: true,
      });
      peer.consumers.set(data.producerId, consumer);
      consumer.on('transportclose', () => peer.consumers.delete(data.producerId));
      consumer.on('producerclose', () => {
        peer.consumers.delete(data.producerId);
        void this.sendNotification(peer.pubkey, 'producerClosed', { producerId: data.producerId });
      });
      return {
        id: consumer.id,
        producerId: data.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        appData: meta ?? null,
      };
    },

    resumeConsumer: async (ctx, raw) => {
      const data = raw as { consumerId: string };
      const peer = this.peers.get(ctx.fromPubkey);
      if (!peer) throw new RpcError('no peer state', 'NO_PEER');
      for (const consumer of peer.consumers.values()) {
        if (consumer.id === data.consumerId) {
          await consumer.resume();
          return {};
        }
      }
      throw new RpcError('unknown consumer', 'NO_CONSUMER');
    },

    closeProducer: async (ctx, raw) => {
      const data = raw as { producerId: string };
      const peer = this.peers.get(ctx.fromPubkey);
      if (!peer) throw new RpcError('no peer state', 'NO_PEER');
      const producer = peer.producers.get(data.producerId);
      if (!producer) throw new RpcError('unknown producer', 'NO_PRODUCER');
      producer.close();
      peer.producers.delete(data.producerId);
      peer.producerAppData.delete(data.producerId);
      // mediasoup fires `producerclose` on every consumer of this producer
      // automatically, so peers see the consumer-end event without us
      // needing to fan it out manually here.
      return {};
    },
  };

  // ── periodic publishers ────────────────────────────────────────────────

  private async publishBeacon(): Promise<void> {
    await publishSfuBeacon(this.relay, this.channelId, Array.from(this.peers.keys()));
  }

  private async publishActiveCall(): Promise<void> {
    await this.relay.publish({
      kind: KIND_SFU_ACTIVE_CALL,
      content: '',
      tags: [
        ['d', this.channelId],
        ['e', this.channelId],
        ['host', this.hostPubkey],
        ['status', this._status],
        ['expiration', String(Math.floor(Date.now() / 1000) + ACTIVE_CALL_TTL_SECONDS)],
        ['t', 'obelisk-sfu-active-call'],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
  }
}
