/**
 * Browser-side mediasoup client for SFU mode.
 *
 * Replaces the werift-era `Peer` for the SFU peer slot in `VoiceClient`.
 * Mesh peers continue to use the existing perfect-negotiation `Peer` class.
 *
 * Lifecycle:
 *   1. `start()`        - open RPC, load mediasoup Device with router caps
 *   2. `createTransports()` - build send + recv WebRtcTransports via RPC
 *   3. `publishTrack()` - turn a local MediaStreamTrack into a Producer
 *   4. (notifications) - `newProducer` from server triggers `consume()`
 *      which mints a Consumer and surfaces its track via `onRemoteTrack`
 *   5. `close()`        - close transports, close RPC
 *
 * `appData.kind` carries the voice-level kind (`camera` / `screen` / etc.)
 * so the receiving client can put the track in the right tile slot. The
 * server passes it through unchanged on consumers, so origin attribution
 * survives the SFU hop without any custom signaling we'd have to invent.
 *
 * The work is delegated: `SfuConsumers` (`sfu-consumers.ts`) owns the
 * receive side, from `newProducer` to the surfaced track, with its retry
 * queue and stale watchdog; `SfuPeerRoster` (`sfu-peers.ts`) the SFU-pushed
 * participant set; `sfu-transports.ts` the WebRtcTransport handshake. This
 * class keeps the RPC, the Device, the two transports, the local producers
 * and the lifecycle.
 */
import { Device } from 'mediasoup-client';
import type { AppData, Producer, RtpCapabilities, Transport } from 'mediasoup-client/types';

import { SfuRpc } from './sfu-rpc';
import type { RpcNotification } from './sfu-rpc';
import type { VoiceTrackKind } from './types';
import type { ProducerAppData, SfuClientEvents, SfuReliabilityEvent } from './sfu-types';
import { SfuConsumers } from './sfu-consumers';
import { SfuPeerRoster } from './sfu-peers';
import {
  STARTUP_RPC_RETRY,
  requestWebRtcTransport,
  transportOptions,
  wireSendTransport,
  wireTransportConnect,
} from './sfu-transports';

export type { SfuClientEvents, SfuReliabilityEvent, SfuRemoteTrack } from './sfu-types';
export { CONSUME_RETRY_DELAYS_MS } from './sfu-consume-queue';
export { STALE_CHECK_INTERVAL_MS, STALE_TIMEOUT_MS, STALE_WARMUP_MS } from './sfu-consumer-health';

type SfuRpcTransport = Pick<SfuRpc, 'start' | 'close' | 'request' | 'requestWithRetry'>;

export class SfuClient {
  private readonly rpc: SfuRpcTransport;
  private readonly events: SfuClientEvents;
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;

  /** voice-kind → Producer, so `setLocalTrack` can replace cleanly. */
  private producers = new Map<VoiceTrackKind, Producer>();

  /** Every forwarded track, its retry queue and its stale watchdog. */
  private readonly consumers: SfuConsumers;
  /** The SFU-pushed roster of OTHER participants (self excluded). */
  private readonly peers: SfuPeerRoster;

  private closed = false;

  constructor(opts: {
    channelId: string;
    sfuPubkey: string;
    sfuUrl?: string;
    selfPubkey: string;
    events: SfuClientEvents;
    onRelayFallback?: () => Promise<void>;
    /** Trusted-author relays the SFU listens on. Outbound RPC envelopes
     *  must publish here, not the dex's default relays. */
    trustedRelays?: readonly string[];
  }) {
    this.events = opts.events;
    this.rpc = new SfuRpc({
      channelId: opts.channelId,
      sfuPubkey: opts.sfuPubkey,
      selfPubkey: opts.selfPubkey,
      ...(opts.sfuUrl ? { sfuUrl: opts.sfuUrl } : {}),
      onNotification: (n) => this.handleNotification(n),
      ...(opts.onRelayFallback ? { onRelayFallback: opts.onRelayFallback } : {}),
      ...(opts.trustedRelays && opts.trustedRelays.length > 0
        ? { publishRelays: opts.trustedRelays }
        : {}),
    });
    this.consumers = new SfuConsumers({
      rpc: this.rpc,
      events: this.events,
      isClosed: () => this.closed,
      device: () => this.device,
      recvTransport: () => this.recvTransport,
      emitReliability: (ev) => this.emitReliability(ev),
    });
    this.peers = new SfuPeerRoster({
      events: this.events,
      dropTracksFor: (pubkey) => this.consumers.dropTracksFor(pubkey),
    });
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error('SfuClient closed');
    await this.rpc.start();
    if (this.closed) return;
    const caps = await this.rpc.requestWithRetry<RtpCapabilities>(
      'getRouterRtpCapabilities',
      undefined,
      STARTUP_RPC_RETRY,
    );
    if (this.closed) return;
    const device = new Device();
    await device.load({ routerRtpCapabilities: caps });
    if (this.closed) return;
    this.device = device;
    await this.createTransports();
  }

  /** Publish a local track. `kind` is the voice-level slot, not the raw
   * media kind; `produce()` resolves that for us. */
  async publishTrack(kind: VoiceTrackKind, track: MediaStreamTrack): Promise<void> {
    if (this.closed) return;
    const sendTransport = this.sendTransport;
    if (!sendTransport) throw new Error('sendTransport not ready');

    // Replace if we already have one of this voice-kind: clients flip
    // camera → screen all the time and we don't want to leak Producers.
    const existing = this.producers.get(kind);
    if (existing) {
      if (!existing.closed) {
        try { await existing.replaceTrack({ track }); return; }
        catch (err) {
          // Recoverable by re-producing below, but that costs every other
          // participant a producerClosed + newProducer (their tile for us
          // is rebuilt), so a flip that keeps taking this path is worth a
          // trace.
          console.warn('[sfu] replaceTrack failed; re-producing', kind, err);
        }
      }
      try { existing.close(); } catch { /* Producer.close() does not throw */ }
      this.producers.delete(kind);
    }
    const producer = await sendTransport.produce({
      track,
      appData: { kind } as AppData,
    });
    if (this.closed) {
      try { producer.close(); } catch { /* Producer.close() does not throw */ }
      return;
    }
    this.producers.set(kind, producer);
    producer.on('transportclose', () => this.producers.delete(kind));
    producer.on('trackended', () => {
      // unpublishTrack warns on the RPC failure itself unless closed.
      void this.unpublishTrack(kind).catch(() => undefined);
    });
  }

  async unpublishTrack(kind: VoiceTrackKind): Promise<void> {
    const producer = this.producers.get(kind);
    if (!producer) return;
    this.producers.delete(kind);
    try {
      await this.rpc.request('closeProducer', { producerId: producer.id });
    } catch (e) {
      // leave() stops local tracks before closing this client, so the
      // producer's `trackended` races the `leave` RPC; a rejection after
      // close() is that race, not a failure worth reporting.
      if (!this.closed) console.warn('[sfu] closeProducer rpc failed', e);
    }
    try { producer.close(); } catch { /* Producer.close() does not throw */ }
  }

  /**
   * Close transports and tell the SFU we're leaving.
   *
   * `awaitLeaveMs` bounds how long we'll wait for the `leave` RPC's
   * underlying Nostr publish to actually transmit before tearing down.
   * Set to 0 (the page-unload path passes 0) to keep the old fire-and-
   * forget behavior: the synchronous DTLS close-notify on transport.close
   * is enough on a closing tab. For graceful cases like channel switch we
   * want a short bounded wait so the leave really lands; otherwise the
   * SFU only finds out via the empty-grace timer / RTP inactivity reaper,
   * which is the long road and was at the heart of the "calls remain
   * active with 0 people" symptom.
   */
  async close(awaitLeaveMs = 500): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Try to land the `leave` RPC publish before we tear down. Bound the
    // wait so a hung relay can't deadlock a channel switch; past the
    // budget the SFU still cleans us up via DTLS close-notify, just on a
    // longer leash. The RPC is usually still pending when `rpc.close()`
    // below rejects it with 'rpc closed', so its rejection is the normal
    // end of every leave, not a failure.
    if (awaitLeaveMs > 0) {
      await Promise.race([
        this.rpc.request('leave', undefined, 1500).catch(() => undefined),
        new Promise<void>((r) => setTimeout(r, awaitLeaveMs)),
      ]);
    } else {
      // Fire-and-forget path for unload: the page is going away, we
      // can't await anything reliably. The publish microtask still runs
      // before the page unloads in practice, and DTLS close-notify on
      // the transport.close() below is the deterministic fallback.
      void this.rpc.request('leave', undefined, 1500).catch(() => undefined);
    }
    this.consumers.close();
    for (const producer of this.producers.values()) {
      try { producer.close(); } catch { /* Producer.close() does not throw */ }
    }
    this.producers.clear();
    this.peers.clear();
    try { this.sendTransport?.close(); } catch { /* Transport.close() does not throw */ }
    try { this.recvTransport?.close(); } catch { /* Transport.close() does not throw */ }
    this.sendTransport = null;
    this.recvTransport = null;
    this.rpc.close();
  }

  // ── transports ─────────────────────────────────────────────────────────

  private async createTransports(): Promise<void> {
    const device = this.device;
    if (!device) throw new Error('device not loaded');
    if (this.closed) return;
    const host = { rpc: this.rpc, events: this.events, isClosed: () => this.closed };

    // Send transport: for our outbound producers.
    const sendInfo = await requestWebRtcTransport(this.rpc, 'send');
    if (this.closed) return;
    const sendTransport = device.createSendTransport(transportOptions(sendInfo));
    if (this.closed) {
      try { sendTransport.close(); } catch { /* Transport.close() does not throw */ }
      return;
    }
    this.sendTransport = sendTransport;
    wireSendTransport(sendTransport, sendInfo.id, host);

    // Recv transport: for consumers the server pushes us.
    const recvInfo = await requestWebRtcTransport(this.rpc, 'recv');
    if (this.closed) {
      try { sendTransport.close(); } catch { /* Transport.close() does not throw */ }
      if (this.sendTransport === sendTransport) this.sendTransport = null;
      return;
    }
    const recvTransport = device.createRecvTransport(transportOptions(recvInfo));
    if (this.closed) {
      try { recvTransport.close(); } catch { /* Transport.close() does not throw */ }
      try { sendTransport.close(); } catch { /* Transport.close() does not throw */ }
      if (this.sendTransport === sendTransport) this.sendTransport = null;
      return;
    }
    this.recvTransport = recvTransport;
    wireTransportConnect(recvTransport, recvInfo.id, host);

    this.consumers.drainQueued();
  }

  // ── server notifications ───────────────────────────────────────────────

  private handleNotification(n: RpcNotification): void {
    if (this.closed) return;
    if (n.method === 'newProducer') {
      const data = n.data as { producerId: string; kind: 'audio' | 'video'; appData: ProducerAppData | null };
      if (!data?.producerId) return;
      this.consumers.onNewProducer(data.producerId, data.appData, data.kind);
    } else if (n.method === 'producerClosed') {
      const data = n.data as { producerId: string };
      this.consumers.onProducerClosed(data.producerId);
    } else if (n.method === 'kicked') {
      const data = n.data as { reason?: string };
      console.warn('[sfu] kicked from room', data?.reason ?? '');
      // close() guards every step it takes; it has nothing left to reject with.
      void this.close().catch(() => undefined);
    } else if (n.method === 'participantList') {
      this.peers.onParticipantList(n.data);
    } else if (n.method === 'peerJoined') {
      this.peers.onPeerJoined(n.data);
    } else if (n.method === 'peerLeft') {
      this.peers.onPeerLeft(n.data);
    }
  }

  /** Snapshot of the SFU-pushed peer list (excluding self); see `SfuPeerRoster.list`. */
  getPeers(): string[] {
    return this.peers.list();
  }

  private emitReliability(ev: SfuReliabilityEvent): void {
    try {
      this.events.onReliabilityEvent?.(ev);
    } catch (err) {
      console.warn('[sfu] onReliabilityEvent handler threw', err);
    }
  }
}
