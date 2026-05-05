/**
 * Browser-side mediasoup client for SFU mode.
 *
 * Replaces the werift-era `Peer` for the SFU peer slot in `VoiceClient`.
 * Mesh peers continue to use the existing perfect-negotiation `Peer` class.
 *
 * Lifecycle:
 *   1. `start()`        — open RPC, load mediasoup Device with router caps
 *   2. `createTransports()` — build send + recv WebRtcTransports via RPC
 *   3. `publishTrack()` — turn a local MediaStreamTrack into a Producer
 *   4. (notifications) — `newProducer` from server triggers `consume()`
 *      which mints a Consumer and surfaces its track via `onRemoteTrack`
 *   5. `close()`        — close transports, close RPC
 *
 * `appData.kind` carries the voice-level kind (`camera` / `screen` / etc.)
 * so the receiving client can put the track in the right tile slot. The
 * server passes it through unchanged on consumers, so origin attribution
 * survives the SFU hop without any custom signaling we'd have to invent.
 */
import { Device } from 'mediasoup-client';
import type {
  AppData,
  Consumer,
  DtlsParameters,
  Producer,
  RtpCapabilities,
  RtpParameters,
  Transport,
} from 'mediasoup-client/types';

import { SfuRpc } from './sfu-rpc';
import type { RpcNotification } from './sfu-rpc';
import type { VoiceTrackKind } from './types';

/**
 * STUN/TURN servers for mediasoup-client transports. Without these, the
 * browser only emits LAN-private host candidates and the SFU has no
 * reachable address to send STUN binding requests to — connection state
 * stays at `connecting` forever. STUN gives us a srflx candidate;
 * TURN provides a relay fallback when symmetric NAT defeats srflx.
 */
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  const turnUrls = (process.env.NEXT_PUBLIC_TURN_URLS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (turnUrls.length > 0) {
    servers.push({
      urls: turnUrls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

const ICE_SERVERS = buildIceServers();

export interface SfuRemoteTrack {
  /** Origin pubkey (the *producer's* author, not the SFU). */
  pubkey: string;
  trackId: string;
  kind: VoiceTrackKind;
  stream: MediaStream;
  consumer: Consumer;
}

export interface SfuClientEvents {
  onRemoteTrack(track: SfuRemoteTrack): void;
  onRemoteTrackEnded(trackId: string): void;
  onConnectionStateChange?(state: string): void;
}

interface ProducerAppData {
  kind?: VoiceTrackKind;
  originPubkey?: string;
}

export class SfuClient {
  private readonly rpc: SfuRpc;
  private readonly events: SfuClientEvents;
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;

  /** voice-kind → Producer, so `setLocalTrack` can replace cleanly. */
  private producers = new Map<VoiceTrackKind, Producer>();

  /** producerId → SfuRemoteTrack — for clean teardown when the SFU
   * notifies us via `producerClosed`. */
  private remoteByProducerId = new Map<string, SfuRemoteTrack>();

  /**
   * Producers we've seen but haven't yet consumed because the recvTransport
   * isn't ready. Once `createTransports()` finishes we drain this queue.
   */
  private pendingProducers: Array<{ producerId: string; appData: ProducerAppData | null; kind: 'audio' | 'video' }> = [];

  private closed = false;

  constructor(opts: {
    channelId: string;
    sfuPubkey: string;
    selfPubkey: string;
    events: SfuClientEvents;
  }) {
    this.events = opts.events;
    this.rpc = new SfuRpc({
      channelId: opts.channelId,
      sfuPubkey: opts.sfuPubkey,
      selfPubkey: opts.selfPubkey,
      onNotification: (n) => this.handleNotification(n),
    });
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error('SfuClient closed');
    await this.rpc.start();
    const caps = await this.rpc.request<RtpCapabilities>('getRouterRtpCapabilities');
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: caps });
    await this.createTransports();
  }

  /** Publish a local track. `kind` is the voice-level slot, not the raw
   * media kind — `produce()` resolves that for us. */
  async publishTrack(kind: VoiceTrackKind, track: MediaStreamTrack): Promise<void> {
    if (this.closed) return;
    if (!this.sendTransport) throw new Error('sendTransport not ready');

    // Replace if we already have one of this voice-kind — clients flip
    // camera → screen all the time and we don't want to leak Producers.
    const existing = this.producers.get(kind);
    if (existing) {
      try { await existing.replaceTrack({ track }); return; }
      catch { /* fall through and re-produce */ }
    }
    const producer = await this.sendTransport.produce({
      track,
      appData: { kind } as AppData,
    });
    this.producers.set(kind, producer);
    producer.on('transportclose', () => this.producers.delete(kind));
    producer.on('trackended', () => {
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
      console.warn('[sfu] closeProducer rpc failed', e);
    }
    try { producer.close(); } catch { /* ignore */ }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const consumer of this.remoteByProducerId.values()) {
      try { consumer.consumer.close(); } catch { /* ignore */ }
    }
    this.remoteByProducerId.clear();
    for (const producer of this.producers.values()) {
      try { producer.close(); } catch { /* ignore */ }
    }
    this.producers.clear();
    try { this.sendTransport?.close(); } catch { /* ignore */ }
    try { this.recvTransport?.close(); } catch { /* ignore */ }
    this.sendTransport = null;
    this.recvTransport = null;
    this.rpc.close();
  }

  // ── transports ─────────────────────────────────────────────────────────

  private async createTransports(): Promise<void> {
    if (!this.device) throw new Error('device not loaded');

    // Send transport — for our outbound producers.
    const sendInfo = await this.rpc.request<{
      id: string;
      iceParameters: unknown;
      iceCandidates: unknown[];
      dtlsParameters: DtlsParameters;
    }>('createWebRtcTransport', { direction: 'send' });
    this.sendTransport = this.device.createSendTransport({
      id: sendInfo.id,
      iceParameters: sendInfo.iceParameters as never,
      iceCandidates: sendInfo.iceCandidates as never,
      dtlsParameters: sendInfo.dtlsParameters,
      iceServers: ICE_SERVERS,
    });
    this.sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this.rpc.request('connectWebRtcTransport', {
        transportId: sendInfo.id,
        dtlsParameters,
      }).then(() => callback()).catch((err) => errback(err as Error));
    });
    this.sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
      this.rpc.request<{ id: string }>('produce', {
        transportId: sendInfo.id,
        kind,
        rtpParameters,
        appData,
      }).then(({ id }) => callback({ id })).catch((err) => errback(err as Error));
    });
    this.sendTransport.on('connectionstatechange', (state) => {
      this.events.onConnectionStateChange?.(state);
    });

    // Recv transport — for consumers the server pushes us.
    const recvInfo = await this.rpc.request<{
      id: string;
      iceParameters: unknown;
      iceCandidates: unknown[];
      dtlsParameters: DtlsParameters;
    }>('createWebRtcTransport', { direction: 'recv' });
    this.recvTransport = this.device.createRecvTransport({
      id: recvInfo.id,
      iceParameters: recvInfo.iceParameters as never,
      iceCandidates: recvInfo.iceCandidates as never,
      dtlsParameters: recvInfo.dtlsParameters,
      iceServers: ICE_SERVERS,
    });
    this.recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this.rpc.request('connectWebRtcTransport', {
        transportId: recvInfo.id,
        dtlsParameters,
      }).then(() => callback()).catch((err) => errback(err as Error));
    });

    // Drain any newProducer events that arrived before the recv transport
    // was ready. Server replays the existing producer list when our recv
    // transport request lands too, so a duplicate is fine — we dedupe by
    // producerId.
    const queued = this.pendingProducers.splice(0);
    for (const item of queued) {
      void this.consumeProducer(item.producerId, item.appData);
    }
  }

  // ── server notifications ───────────────────────────────────────────────

  private handleNotification(n: RpcNotification): void {
    if (n.method === 'newProducer') {
      const data = n.data as { producerId: string; kind: 'audio' | 'video'; appData: ProducerAppData | null };
      if (!data?.producerId) return;
      if (this.remoteByProducerId.has(data.producerId)) return;
      if (!this.recvTransport || !this.device) {
        this.pendingProducers.push({ producerId: data.producerId, appData: data.appData, kind: data.kind });
        return;
      }
      void this.consumeProducer(data.producerId, data.appData);
    } else if (n.method === 'producerClosed') {
      const data = n.data as { producerId: string };
      const remote = this.remoteByProducerId.get(data.producerId);
      if (!remote) return;
      this.remoteByProducerId.delete(data.producerId);
      try { remote.consumer.close(); } catch { /* ignore */ }
      this.events.onRemoteTrackEnded(remote.trackId);
    } else if (n.method === 'kicked') {
      const data = n.data as { reason?: string };
      console.warn('[sfu] kicked from room', data?.reason ?? '');
      this.close();
    }
  }

  private async consumeProducer(producerId: string, appData: ProducerAppData | null): Promise<void> {
    if (!this.device || !this.recvTransport) return;
    if (this.remoteByProducerId.has(producerId)) return;
    try {
      const consumeData = await this.rpc.request<{
        id: string;
        producerId: string;
        kind: 'audio' | 'video';
        rtpParameters: RtpParameters;
        appData: ProducerAppData | null;
      }>('consume', {
        producerId,
        rtpCapabilities: this.device.rtpCapabilities,
      });
      const consumer = await this.recvTransport.consume({
        id: consumeData.id,
        producerId: consumeData.producerId,
        kind: consumeData.kind,
        rtpParameters: consumeData.rtpParameters,
      });
      // Server starts consumers paused so the client can prepare its
      // <video> element first. Resume immediately on our side; the dex
      // attaches the track in the next React render tick.
      await this.rpc.request('resumeConsumer', { consumerId: consumer.id });

      const meta = consumeData.appData ?? appData ?? {};
      const voiceKind: VoiceTrackKind = meta.kind ?? (consumer.kind === 'audio' ? 'audio' : 'camera');
      const stream = new MediaStream([consumer.track]);
      const remote: SfuRemoteTrack = {
        pubkey: meta.originPubkey ?? '',
        trackId: consumer.track.id,
        kind: voiceKind,
        stream,
        consumer,
      };
      this.remoteByProducerId.set(producerId, remote);
      consumer.on('transportclose', () => {
        this.remoteByProducerId.delete(producerId);
        this.events.onRemoteTrackEnded(remote.trackId);
      });
      this.events.onRemoteTrack(remote);
    } catch (err) {
      console.warn('[sfu] consume failed', producerId, err);
    }
  }
}
