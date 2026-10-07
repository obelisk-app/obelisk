/**
 * The `obelisk-control` data channel of one `Peer`: the hello and the
 * periodic peer snapshots that drive transitive discovery, the ping/pong
 * heartbeat with its dead-peer timeout, and the fast bye. Rides the data
 * channel simple-peer opens beside the media.
 */
import {
  DEAD_PEER_TIMEOUT_MS,
  PEER_SNAPSHOT_INTERVAL_MS,
  PING_INTERVAL_MS,
  type ControlMessage,
} from '@/constants/voice/control-channel';
import type { PeerEvents, PeerOptions } from './peer-types';

export function decodeControl(data: unknown): ControlMessage | null {
  try {
    if (typeof data === 'string') return JSON.parse(data) as ControlMessage;
    if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(new Uint8Array(data))) as ControlMessage;
    if (ArrayBuffer.isView(data)) {
      return JSON.parse(new TextDecoder().decode(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      )) as ControlMessage;
    }
    return JSON.parse(String(data)) as ControlMessage;
  } catch {
    return null;
  }
}

export interface ControlChannelHost {
  /** The data channel, as simple-peer exposes it. */
  readonly channel: { readonly connected: boolean; send(data: string): void };
  readonly events: Pick<PeerEvents, 'onTransitivePeers' | 'onControlPeerSnapshot' | 'onControlPeerAdded' | 'onControlPeerRemoved' | 'onPeerDead'>;
  readonly sessionId: string;
  isClosed(): boolean;
}

export class PeerControlChannel {
  private started = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private deadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly host: ControlChannelHost,
    private readonly control: PeerOptions['control'],
  ) {}

  isOpen(): boolean {
    return this.host.channel.connected;
  }

  /** The data channel connected: say hello, start the heartbeat and the snapshots. */
  start(): void {
    if (!this.control || this.started || this.host.isClosed()) return;
    this.started = true;
    this.broadcast({
      type: 'hello',
      peers: this.control.getCurrentPeers(),
      sessionId: this.host.sessionId,
      build: this.control.selfBuild,
    });
    this.armDeadTimer();
    this.pingTimer = setInterval(
      () => this.broadcast({ type: 'ping', ts: Date.now() }),
      PING_INTERVAL_MS,
    );
    this.snapshotTimer = setInterval(
      () => this.broadcast({
        type: 'peerSnapshot',
        peers: this.control?.getCurrentPeers() ?? [],
        ts: Date.now(),
      }),
      PEER_SNAPSHOT_INTERVAL_MS,
    );
    this.control.metrics.controlChannel.opened++;
  }

  broadcast(message: ControlMessage): void {
    if (!this.host.channel.connected) return;
    // simple-peer throws on a channel that closed between the check and the
    // send; the message is best effort by design (the relay bye and the
    // heartbeat timeout cover a lost one).
    try { this.host.channel.send(JSON.stringify(message)); } catch { /* best effort */ }
  }

  handle(message: ControlMessage | null): void {
    if (!message || typeof message.type !== 'string') return;
    this.armDeadTimer();
    switch (message.type) {
      case 'hello':
        this.host.events.onTransitivePeers?.(Array.isArray(message.peers) ? message.peers : [], message.build ?? '');
        break;
      case 'peerSnapshot':
        this.host.events.onControlPeerSnapshot?.(Array.isArray(message.peers) ? message.peers : []);
        break;
      case 'peerAdded':
        if (typeof message.pubkey === 'string') this.host.events.onControlPeerAdded?.(message.pubkey);
        break;
      case 'peerRemoved':
        if (typeof message.pubkey === 'string') this.host.events.onControlPeerRemoved?.(message.pubkey);
        break;
      case 'bye':
        this.host.events.onPeerDead?.(`bye:${message.reason ?? 'remote-bye'}`);
        break;
      case 'ping':
        this.broadcast({ type: 'pong', ts: Date.now(), echoTs: message.ts });
        break;
      case 'pong':
        if (this.control) {
          this.control.metrics.controlChannel.pongRcvd++;
          this.control.metrics.controlChannel.lastRttMs = Math.max(0, Date.now() - message.echoTs);
        }
        break;
    }
  }

  /** Stop the heartbeat, the snapshots and the dead-peer timeout. */
  stop(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.deadTimer) clearTimeout(this.deadTimer);
  }

  private armDeadTimer(): void {
    if (!this.control) return;
    if (this.deadTimer) clearTimeout(this.deadTimer);
    this.deadTimer = setTimeout(() => {
      this.deadTimer = null;
      if (!this.host.isClosed()) this.host.events.onPeerDead?.('heartbeat-lost');
    }, DEAD_PEER_TIMEOUT_MS);
  }
}
