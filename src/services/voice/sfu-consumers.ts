/**
 * The receive side of an `SfuClient`: every producer the SFU announced,
 * from `newProducer` to the surfaced `SfuRemoteTrack` and back to
 * `producerClosed`. Owns the registry of forwarded tracks, the producers
 * queued before the recv transport was ready, the consume retry queue
 * (`sfu-consume-queue.ts`) and the stale watchdog
 * (`sfu-consumer-health.ts`).
 */
import type { Consumer, Device, Transport } from 'mediasoup-client/types';

import type { SfuRpc } from './sfu-rpc';
import type { ProducerAppData, SfuClientEvents, SfuReliabilityEvent, SfuRemoteTrack } from './sfu-types';
import type { VoiceTrackKind } from './types';
import { ConsumeQueue } from './sfu-consume-queue';
import { ConsumerHealthWatch } from './sfu-consumer-health';

export interface SfuConsumersHost {
  rpc: Pick<SfuRpc, 'request'>;
  events: Pick<SfuClientEvents, 'onRemoteTrack' | 'onRemoteTrackEnded'>;
  isClosed(): boolean;
  device(): Device | null;
  recvTransport(): Transport | null;
  emitReliability(ev: SfuReliabilityEvent): void;
}

export class SfuConsumers {
  /** producerId → SfuRemoteTrack, for clean teardown when the SFU
   * notifies us via `producerClosed`. */
  private readonly remoteByProducerId = new Map<string, SfuRemoteTrack>();

  /**
   * Producers we've seen but haven't yet consumed because the recvTransport
   * isn't ready. Once the transports are up `drainQueued` empties this.
   */
  private pendingProducers: Array<{ producerId: string; appData: ProducerAppData | null; kind: 'audio' | 'video' }> = [];

  private readonly queue: ConsumeQueue;
  private readonly health: ConsumerHealthWatch;

  constructor(private readonly host: SfuConsumersHost) {
    this.queue = new ConsumeQueue({
      rpc: host.rpc,
      isClosed: () => host.isClosed(),
      device: () => host.device(),
      recvTransport: () => host.recvTransport(),
      hasRemote: (producerId) => this.remoteByProducerId.has(producerId),
      surface: (producerId, consumer, consumerKind, appData) => this.surfaceConsumer(producerId, consumer, consumerKind, appData),
      emitReliability: (ev) => host.emitReliability(ev),
    });
    this.health = new ConsumerHealthWatch({
      isClosed: () => host.isClosed(),
      remotes: () => this.remoteByProducerId,
      onStale: (producerId, remote, appData) => this.rebuildStale(producerId, remote, appData),
    });
  }

  /** `newProducer`: consume now, or queue until the recv transport is up. */
  onNewProducer(producerId: string, appData: ProducerAppData | null, kind: 'audio' | 'video'): void {
    if (this.remoteByProducerId.has(producerId)) return;
    if (this.queue.has(producerId)) return;
    if (!this.host.recvTransport() || !this.host.device()) {
      this.pendingProducers.push({ producerId, appData, kind });
      return;
    }
    this.queue.enqueue(producerId, appData);
  }

  /** `producerClosed`: the SFU tore the producer down. */
  onProducerClosed(producerId: string): void {
    // Cancel any in-flight retry first: the producer is gone, no
    // amount of retrying brings it back, and a queued attempt firing
    // after the producerClosed would just emit a wasted `consume-failed`.
    this.queue.cancel(producerId);
    const remote = this.remoteByProducerId.get(producerId);
    if (!remote) return;
    this.remoteByProducerId.delete(producerId);
    this.health.forget(remote.consumer.id);
    try { remote.consumer.close(); } catch { /* close() does not throw */ }
    this.host.events.onRemoteTrackEnded(remote.trackId);
  }

  /**
   * Drain any newProducer events that arrived before the recv transport
   * was ready. Server replays the existing producer list when our recv
   * transport request lands too, so a duplicate is fine; we dedupe by
   * producerId.
   */
  drainQueued(): void {
    const queued = this.pendingProducers.splice(0);
    if (this.host.isClosed()) return;
    for (const item of queued) {
      this.queue.enqueue(item.producerId, item.appData);
    }
  }

  /** Close every consumer whose producer originated from `pubkey`, dropping
   *  the corresponding remote-track entry and notifying the dex. Also
   *  cancels any in-flight retry for the same peer: when a peer leaves
   *  abruptly we don't want the retry ladder hammering `consume` for a
   *  producer the SFU has already torn down on its side. */
  dropTracksFor(pubkey: string): void {
    for (const [producerId, remote] of Array.from(this.remoteByProducerId.entries())) {
      if (remote.pubkey !== pubkey) continue;
      this.remoteByProducerId.delete(producerId);
      this.health.forget(remote.consumer.id);
      try { remote.consumer.close(); } catch { /* close() does not throw */ }
      try { this.host.events.onRemoteTrackEnded(remote.trackId); } catch (err) {
        console.warn('[sfu] onRemoteTrackEnded handler threw', err);
      }
    }
    this.queue.cancelForPeer(pubkey);
  }

  /** The receive-side half of `SfuClient.close()`, in its order. */
  close(): void {
    this.health.stop();
    this.pendingProducers = [];
    this.queue.clear();
    for (const remote of this.remoteByProducerId.values()) {
      try { remote.consumer.close(); } catch { /* close() does not throw */ }
    }
    this.remoteByProducerId.clear();
    this.health.clear();
  }

  private surfaceConsumer(
    producerId: string,
    consumer: Consumer,
    consumerKind: 'audio' | 'video' | null,
    appData: ProducerAppData | null,
  ): void {
    const meta = appData ?? {};
    const fallbackKind = consumerKind ?? (consumer.kind === 'audio' ? 'audio' : 'video');
    const voiceKind: VoiceTrackKind = meta.kind ?? (fallbackKind === 'audio' ? 'audio' : 'camera');
    const stream = new MediaStream([consumer.track]);
    const remote: SfuRemoteTrack = {
      pubkey: meta.originPubkey ?? '',
      trackId: consumer.track.id,
      kind: voiceKind,
      stream,
      consumer,
    };
    this.remoteByProducerId.set(producerId, remote);
    this.health.track(consumer.id, producerId, appData);
    // Two distinct close events from mediasoup-client v3.20:
    //   `transportclose` - recv transport closed (page unload, full
    //                      SFU reconnect). Fires once per recv transport
    //                      teardown across all consumers.
    //   `trackended` - the underlying MediaStreamTrack ended (RTP stops
    //                  flowing for long enough that the browser marks
    //                  the track ended). Belt-and-suspenders backup for
    //                  the explicit `producerClosed` notification the
    //                  SFU sends; if the notification is delayed or
    //                  dropped, this still fires within a few seconds
    //                  of the upstream camera/screen-share toggling off.
    // Pre-fix neither was wired and the SFU's `closeProducer` handler
    // didn't fan out `producerClosed`, so a remote camera-off left a
    // frozen tile in everyone's grid until they left the channel.
    const onClose = () => {
      if (!this.remoteByProducerId.has(producerId)) return;
      this.remoteByProducerId.delete(producerId);
      this.health.forget(consumer.id);
      try { consumer.close(); } catch { /* close() does not throw */ }
      this.host.events.onRemoteTrackEnded(remote.trackId);
    };
    consumer.on('transportclose', onClose);
    consumer.on('trackended', onClose);
    this.host.events.onRemoteTrack(remote);
    this.health.start();
  }

  /** The watchdog found a wedged consumer: drop it and consume afresh. */
  private rebuildStale(producerId: string, remote: SfuRemoteTrack, appData: ProducerAppData | null): void {
    this.remoteByProducerId.delete(producerId);
    try { remote.consumer.close(); } catch { /* close() does not throw */ }
    try { this.host.events.onRemoteTrackEnded(remote.trackId); } catch (err) {
      console.warn('[sfu] onRemoteTrackEnded handler threw', err);
    }
    this.host.emitReliability({
      kind: 'stale-consumer',
      producerId,
      peerPubkey: appData?.originPubkey || remote.pubkey || undefined,
    });
    this.queue.enqueue(producerId, appData);
  }
}
