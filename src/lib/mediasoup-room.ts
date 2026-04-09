/**
 * mediasoup Room & Peer management.
 *
 * Each voice channel gets a Room (with a Router).
 * Each connected user gets a Peer (with transports, producers, consumers).
 */

import type {
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  DtlsParameters,
  RtpParameters,
  RtpCapabilities,
  MediaKind,
} from 'mediasoup/node/lib/types';
import { getTransportOptions } from './mediasoup-config';

// ── Peer ───────────────────────────────────────────────────────

export class MediasoupPeer {
  readonly socketId: string;
  readonly pubkey: string;
  transports: Map<string, WebRtcTransport> = new Map();
  producers: Map<string, Producer> = new Map();
  consumers: Map<string, Consumer> = new Map();

  constructor(socketId: string, pubkey: string) {
    this.socketId = socketId;
    this.pubkey = pubkey;
  }

  async connectTransport(transportId: string, dtlsParameters: DtlsParameters): Promise<void> {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);
    await transport.connect({ dtlsParameters });
  }

  async createProducer(
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
    appData: Record<string, unknown> = {},
  ): Promise<Producer> {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const producer = await transport.produce({ kind, rtpParameters, appData });

    producer.on('transportclose', () => {
      this.producers.delete(producer.id);
    });

    this.producers.set(producer.id, producer);
    return producer;
  }

  async createConsumer(
    transportId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities,
    router: Router,
  ): Promise<Consumer | null> {
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      return null;
    }

    const transport = this.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Start paused — client resumes after setup
    });

    consumer.on('transportclose', () => {
      this.consumers.delete(consumer.id);
    });
    consumer.on('producerclose', () => {
      this.consumers.delete(consumer.id);
    });

    this.consumers.set(consumer.id, consumer);
    return consumer;
  }

  close(): void {
    for (const transport of this.transports.values()) {
      transport.close();
    }
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
  }
}

// ── Room ───────────────────────────────────────────────────────

export class MediasoupRoom {
  readonly channelId: string;
  readonly router: Router;
  peers: Map<string, MediasoupPeer> = new Map();

  constructor(channelId: string, router: Router) {
    this.channelId = channelId;
    this.router = router;
  }

  get rtpCapabilities(): RtpCapabilities {
    return this.router.rtpCapabilities;
  }

  get isEmpty(): boolean {
    return this.peers.size === 0;
  }

  addPeer(socketId: string, pubkey: string): MediasoupPeer {
    const peer = new MediasoupPeer(socketId, pubkey);
    this.peers.set(socketId, peer);
    return peer;
  }

  removePeer(socketId: string): void {
    const peer = this.peers.get(socketId);
    if (peer) {
      peer.close();
      this.peers.delete(socketId);
    }
  }

  getPeer(socketId: string): MediasoupPeer | undefined {
    return this.peers.get(socketId);
  }

  async createWebRtcTransport(): Promise<WebRtcTransport> {
    const transport = await this.router.createWebRtcTransport(getTransportOptions());
    return transport;
  }

  /** Get all producers from all peers except the given socket. */
  getOtherProducers(excludeSocketId: string): Array<{ producerId: string; pubkey: string; kind: MediaKind; appData: Record<string, unknown> }> {
    const result: Array<{ producerId: string; pubkey: string; kind: MediaKind; appData: Record<string, unknown> }> = [];
    for (const [socketId, peer] of this.peers) {
      if (socketId === excludeSocketId) continue;
      for (const producer of peer.producers.values()) {
        result.push({
          producerId: producer.id,
          pubkey: peer.pubkey,
          kind: producer.kind,
          appData: producer.appData as Record<string, unknown>,
        });
      }
    }
    return result;
  }

  close(): void {
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
    this.router.close();
  }
}
