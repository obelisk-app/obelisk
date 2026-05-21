/**
 * Per-peer control plane that rides over an RTCDataChannel inside the
 * mesh PeerConnection. Used for:
 *
 *  - Fast hangup detection. A 2.5 s ping/pong heartbeat with a 20 s
 *    dead-peer timer catches vanished peers faster than the underlying
 *    ICE-failure path while avoiding false teardown from background-tab
 *    timer throttling.
 *  - Transitive WebRTC discovery. The `hello`, periodic
 *    `peerSnapshot`, and `peerAdded` / `peerRemoved` messages let A
 *    learn about C through B without ever consulting the relay roster —
 *    the dex stays workable when a single peer's beacons are dropped or
 *    the relay throttles.
 *  - Graceful goodbye. The `bye` message reaches the remote
 *    instantly even when the relay refuses our final kind 25050.
 *
 * Symmetry — only the impolite side calls `createDataChannel`. The
 * polite side adopts the channel via `pc.ondatachannel`. Both sides
 * creating it would produce two channels per peer pair and both
 * `hello`/`ping` cadences would fire twice. Polite/impolite is the
 * lex-ordering-derived flag the rest of the mesh already uses for
 * perfect negotiation.
 */
import type { VoiceMetrics } from './metrics';
import { pushVoiceDebug } from './debug';

export const CONTROL_CHANNEL_LABEL = 'obelisk-control';
export const PING_INTERVAL_MS = 2500;
export const DEAD_PEER_TIMEOUT_MS = 20_000;
export const OPEN_TIMEOUT_MS = 15_000;
export const PEER_SNAPSHOT_INTERVAL_MS = 5_000;

export type ControlMessage =
  | { type: 'hello'; peers: string[]; sessionId: string; build: string }
  | { type: 'peerSnapshot'; peers: string[]; ts: number }
  | { type: 'peerAdded'; pubkey: string }
  | { type: 'peerRemoved'; pubkey: string }
  | { type: 'bye'; reason: string }
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number; echoTs: number };

export interface ControlChannelEvents {
  onHello(remotePeers: string[], remoteBuild: string): void;
  onPeerSnapshot(remotePeers: string[]): void;
  onPeerAdded(pubkey: string): void;
  onPeerRemoved(pubkey: string): void;
  onBye(reason: string): void;
  /** Heartbeat lost OR open-timeout expired. The owner should tear the peer down. */
  onDead(reason: 'heartbeat-lost' | 'open-timeout' | 'channel-closed'): void;
  onRtt(ms: number): void;
}

export interface ControlChannelOptions {
  pc: RTCPeerConnection;
  impolite: boolean;
  sessionId: string;
  selfBuild: string;
  remotePubkey: string;
  initialPeers: () => string[];
  events: ControlChannelEvents;
  metrics: VoiceMetrics;
}

export class ControlChannel {
  private dc: RTCDataChannel | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private peerSnapshotTimer: ReturnType<typeof setInterval> | null = null;
  private deadTimer: ReturnType<typeof setTimeout> | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private opened = false;
  private readonly events: ControlChannelEvents;
  private readonly metrics: VoiceMetrics;
  private readonly impolite: boolean;
  private readonly sessionId: string;
  private readonly selfBuild: string;
  private readonly remotePubkey: string;
  private readonly initialPeers: () => string[];

  constructor(opts: ControlChannelOptions) {
    this.events = opts.events;
    this.metrics = opts.metrics;
    this.impolite = opts.impolite;
    this.sessionId = opts.sessionId;
    this.selfBuild = opts.selfBuild;
    this.remotePubkey = opts.remotePubkey;
    this.initialPeers = opts.initialPeers;

    if (opts.impolite) {
      try {
        this.dc = opts.pc.createDataChannel(CONTROL_CHANNEL_LABEL, { ordered: true });
        this.attach(this.dc);
      } catch (err) {
        pushVoiceDebug({
          kind: 'pc-state',
          peer: this.remotePubkey,
          payload: { event: 'control-channel-create-failed', err: String(err) },
        });
      }
    } else {
      opts.pc.ondatachannel = (ev) => {
        if (ev.channel.label !== CONTROL_CHANNEL_LABEL) return;
        if (this.closed) return;
        if (this.dc) return; // already adopted
        this.dc = ev.channel;
        this.attach(ev.channel);
      };
    }

    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      if (this.opened || this.closed) return;
      this.events.onDead('open-timeout');
    }, OPEN_TIMEOUT_MS);
  }

  isOpen(): boolean {
    return !this.closed && this.opened && this.dc?.readyState === 'open';
  }

  /**
   * Best-effort send. Drops silently if the channel hasn't opened or has
   * already closed — the caller does not need to await delivery; the only
   * load-bearing message (`bye`) has the relay path as a backup.
   */
  send(msg: ControlMessage): void {
    if (this.closed) return;
    const dc = this.dc;
    if (!dc || dc.readyState !== 'open') return;
    try {
      dc.send(JSON.stringify(msg));
    } catch (err) {
      pushVoiceDebug({
        kind: 'pc-state',
        peer: this.remotePubkey,
        payload: { event: 'control-channel-send-failed', err: String(err), type: msg.type },
      });
    }
  }

  /** Send the latest known peer set immediately over this open channel. */
  sendPeerSnapshot(): void {
    this.send({ type: 'peerSnapshot', peers: this.initialPeers(), ts: Date.now() });
  }

  /** Idempotent. Sends `bye` if the channel is still open, then tears down. */
  close(reason = 'local-leave'): void {
    if (this.closed) return;
    this.closed = true;
    if (this.dc?.readyState === 'open') {
      try { this.dc.send(JSON.stringify({ type: 'bye', reason } satisfies ControlMessage)); }
      catch { /* best effort */ }
    }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.peerSnapshotTimer) { clearInterval(this.peerSnapshotTimer); this.peerSnapshotTimer = null; }
    if (this.deadTimer) { clearTimeout(this.deadTimer); this.deadTimer = null; }
    if (this.openTimer) { clearTimeout(this.openTimer); this.openTimer = null; }
    try { this.dc?.close(); } catch { /* ignore */ }
    this.dc = null;
  }

  private attach(dc: RTCDataChannel): void {
    dc.onopen = () => {
      if (this.closed) return;
      this.opened = true;
      this.metrics.controlChannel.opened++;
      if (this.openTimer) { clearTimeout(this.openTimer); this.openTimer = null; }
      this.send({
        type: 'hello',
        peers: this.initialPeers(),
        sessionId: this.sessionId,
        build: this.selfBuild,
      });
      this.armDeadTimer();
      this.pingTimer = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
      this.peerSnapshotTimer = setInterval(() => this.sendPeerSnapshot(), PEER_SNAPSHOT_INTERVAL_MS);
      pushVoiceDebug({
        kind: 'pc-state',
        peer: this.remotePubkey,
        payload: { event: 'control-channel-open' },
      });
    };

    dc.onmessage = (ev) => {
      if (this.closed) return;
      let msg: ControlMessage;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      this.handleMessage(msg);
    };

    dc.onclose = () => {
      if (this.closed) return;
      this.events.onDead('channel-closed');
    };

    dc.onerror = () => {
      pushVoiceDebug({
        kind: 'pc-state',
        peer: this.remotePubkey,
        payload: { event: 'control-channel-error' },
      });
    };
  }

  private handleMessage(msg: ControlMessage): void {
    switch (msg.type) {
      case 'hello':
        this.events.onHello(msg.peers ?? [], msg.build ?? '');
        // Hello implies the channel is alive; reset the dead-peer timer.
        this.armDeadTimer();
        break;
      case 'peerSnapshot':
        this.events.onPeerSnapshot(Array.isArray(msg.peers) ? msg.peers : []);
        this.armDeadTimer();
        break;
      case 'peerAdded':
        if (typeof msg.pubkey === 'string') this.events.onPeerAdded(msg.pubkey);
        this.armDeadTimer();
        break;
      case 'peerRemoved':
        if (typeof msg.pubkey === 'string') this.events.onPeerRemoved(msg.pubkey);
        this.armDeadTimer();
        break;
      case 'bye':
        this.events.onBye(msg.reason ?? 'remote-bye');
        // Don't fire onDead — the owner's bye-handler already tears
        // the peer down; firing both would double-trigger the
        // tornDown counter.
        this.closed = true;
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
        if (this.peerSnapshotTimer) { clearInterval(this.peerSnapshotTimer); this.peerSnapshotTimer = null; }
        if (this.deadTimer) { clearTimeout(this.deadTimer); this.deadTimer = null; }
        if (this.openTimer) { clearTimeout(this.openTimer); this.openTimer = null; }
        try { this.dc?.close(); } catch { /* ignore */ }
        this.dc = null;
        break;
      case 'ping':
        this.send({ type: 'pong', ts: Date.now(), echoTs: msg.ts });
        this.armDeadTimer();
        break;
      case 'pong': {
        const rtt = Date.now() - (msg.echoTs ?? Date.now());
        if (rtt >= 0 && rtt < 60_000) {
          this.metrics.controlChannel.pongRcvd++;
          this.metrics.controlChannel.lastRttMs = rtt;
          this.events.onRtt(rtt);
        }
        this.armDeadTimer();
        break;
      }
    }
  }

  private sendPing(): void {
    if (!this.isOpen()) return;
    this.metrics.controlChannel.pingSent++;
    this.send({ type: 'ping', ts: Date.now() });
  }

  private armDeadTimer(): void {
    if (this.closed) return;
    if (this.deadTimer) clearTimeout(this.deadTimer);
    this.deadTimer = setTimeout(() => {
      this.deadTimer = null;
      if (this.closed) return;
      this.events.onDead('heartbeat-lost');
    }, DEAD_PEER_TIMEOUT_MS);
  }
}
