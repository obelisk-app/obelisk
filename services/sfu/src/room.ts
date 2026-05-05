/**
 * One Room per active SFU call. Holds:
 *   - The set of `Peer`s (one per browser participant).
 *   - The forwarded-track table: every track we know about, indexed by
 *     origin pubkey, so when a new peer joins we add them as a sender on
 *     their PC immediately.
 *   - Periodic publishers: kind 20078 beacon (every 15s) and kind 31314
 *     active-call state (every 60s).
 *   - The empty-room timeout that ends the call after grace.
 *
 * The Room is owned by the RoomManager. Lifecycle:
 *   start()  — RoomManager → Room.start(); subscribes signaling, fires
 *              first beacon + 31314, opens membership watcher.
 *   close()  — drains all peers, publishes a final 31314 status=closed,
 *              releases the membership watcher.
 */
import type { MediaStreamTrack, RTCIceServer } from 'werift';

import { canDialRoom } from './auth.js';
import {
  KIND_SFU_ACTIVE_CALL,
} from './nip-kinds.js';
import { createLogger } from './log.js';
import { Peer } from './peer.js';
import { publishSfuBeacon, sendSignal, subscribeSfuSignals } from './signaling.js';
import type { Config } from './config.js';
import type { MembershipTracker } from './membership.js';
import type { RelayPool } from './relay.js';
import type {
  Hex,
  RoomRules,
  RoomSnapshot,
  RoomStatus,
  VoiceSignalPayload,
  VoiceTrackKind,
} from './types.js';

const log = createLogger('room');

const BEACON_INTERVAL_MS = 15_000;
const ACTIVE_CALL_INTERVAL_MS = 60_000;
const ACTIVE_CALL_TTL_SECONDS = 90;

interface ForwardedTrack {
  origin: Hex;
  kind: VoiceTrackKind;
  track: MediaStreamTrack;
  trackId: string;
}

export interface RoomOptions {
  channelId: string;
  hostPubkey: Hex;
  rules: RoomRules;
  cfg: Config;
  relay: RelayPool;
  membership: MembershipTracker;
  onClosed: (channelId: string) => void;
}

export class Room {
  readonly channelId: string;
  readonly hostPubkey: Hex;
  readonly startedAt = Math.floor(Date.now() / 1000);

  private _rules: RoomRules;
  private _status: RoomStatus = 'starting';
  private readonly cfg: Config;
  private readonly relay: RelayPool;
  private readonly membership: MembershipTracker;
  private readonly onClosed: (channelId: string) => void;

  private peers = new Map<Hex, Peer>();
  /** trackId → ForwardedTrack, the inbound side. */
  private tracks = new Map<string, ForwardedTrack>();

  private beaconTimer: NodeJS.Timeout | null = null;
  private activeCallTimer: NodeJS.Timeout | null = null;
  private emptyTimer: NodeJS.Timeout | null = null;
  private endsAtTimer: NodeJS.Timeout | null = null;
  private signalUnsub: (() => void) | null = null;
  private membershipRelease: (() => void) | null = null;

  constructor(opts: RoomOptions) {
    this.channelId = opts.channelId;
    this.hostPubkey = opts.hostPubkey;
    this._rules = opts.rules;
    this.cfg = opts.cfg;
    this.relay = opts.relay;
    this.membership = opts.membership;
    this.onClosed = opts.onClosed;
  }

  get rules(): RoomRules {
    return this._rules;
  }

  get status(): RoomStatus {
    return this._status;
  }

  get participantCount(): number {
    return this.peers.size;
  }

  get connectedPubkeys(): Hex[] {
    return Array.from(this.peers.keys());
  }

  snapshot(): RoomSnapshot {
    return {
      channelId: this.channelId,
      hostPubkey: this.hostPubkey,
      status: this._status,
      startedAt: this.startedAt,
      rules: this._rules,
      participants: this.connectedPubkeys,
    };
  }

  async start(): Promise<void> {
    log.info('room starting', {
      channelId: this.channelId.slice(0, 8),
      host: this.hostPubkey.slice(0, 8),
    });

    // Watch NIP-29 admin/member lists. We block on `ready` only briefly:
    // if the lists never arrive, we still publish 31314 but reject all
    // dials. The host can always end the call and try a different relay.
    const watch = this.membership.watch(this.channelId);
    this.membershipRelease = watch.release;
    watch.ready.catch((err) => {
      log.warn('membership not ready — dials will be refused until lists arrive', {
        channelId: this.channelId.slice(0, 8),
        err: err.message,
      });
    });

    // Open signaling first so we don't miss offers from peers that see
    // our beacon and dial immediately.
    this.signalUnsub = subscribeSfuSignals(
      this.relay,
      this.channelId,
      this.relay.pubkey,
      (from, payload) => this.handleSignal(from, payload),
    );

    this._status = 'active';
    await this.publishActiveCall();
    await this.publishBeacon();

    this.beaconTimer = setInterval(() => {
      void this.publishBeacon().catch((err) =>
        log.warn('beacon failed', { err: (err as Error).message }),
      );
    }, BEACON_INTERVAL_MS);
    this.beaconTimer.unref?.();

    this.activeCallTimer = setInterval(() => {
      void this.publishActiveCall().catch((err) =>
        log.warn('active-call refresh failed', { err: (err as Error).message }),
      );
    }, ACTIVE_CALL_INTERVAL_MS);
    this.activeCallTimer.unref?.();

    this.scheduleEndsAt();
    log.info('room active', { channelId: this.channelId.slice(0, 8) });
  }

  updateRules(next: RoomRules): void {
    this._rules = next;
    log.info('rules updated', {
      channelId: this.channelId.slice(0, 8),
      allow: next.allow?.length ?? 'any',
      deny: next.deny.length,
    });
    this.scheduleEndsAt();
    void this.publishActiveCall().catch(() => undefined);
    // Re-evaluate existing peers against the new rules.
    for (const pubkey of this.peers.keys()) {
      const decision = canDialRoom({
        rules: next,
        members: this.membership.getMembers(this.channelId),
        hostPubkey: this.hostPubkey,
        sender: pubkey,
      });
      if (!decision.ok) {
        log.info('dropping peer per updated rules', {
          peer: pubkey.slice(0, 8),
          reason: decision.reason,
        });
        this.dropPeer(pubkey);
      }
    }
  }

  async kick(target: Hex, reason?: string): Promise<void> {
    if (!this._rules.deny.includes(target)) {
      this._rules = { ...this._rules, deny: [...this._rules.deny, target] };
    }
    if (this.peers.has(target)) {
      log.info('kicking peer', {
        target: target.slice(0, 8),
        reason: reason ?? '(none)',
      });
      this.dropPeer(target);
    }
    await this.publishActiveCall();
  }

  async close(): Promise<void> {
    if (this._status === 'closed' || this._status === 'ending') return;
    this._status = 'ending';
    log.info('room closing', { channelId: this.channelId.slice(0, 8) });

    if (this.beaconTimer) clearInterval(this.beaconTimer);
    if (this.activeCallTimer) clearInterval(this.activeCallTimer);
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    if (this.endsAtTimer) clearTimeout(this.endsAtTimer);
    this.beaconTimer = null;
    this.activeCallTimer = null;
    this.emptyTimer = null;
    this.endsAtTimer = null;

    this.signalUnsub?.();
    this.signalUnsub = null;

    // Tell each peer 'bye' before closing the PC, then close the PC.
    for (const [pubkey, peer] of this.peers) {
      try {
        await sendSignal(this.relay, this.channelId, pubkey, {
          type: 'bye',
          sessionId: 'closing',
          seq: 0,
        });
      } catch {
        // best-effort
      }
      peer.close();
    }
    this.peers.clear();
    this.tracks.clear();

    this._status = 'closed';
    await this.publishActiveCall();

    this.membershipRelease?.();
    this.membershipRelease = null;
    this.onClosed(this.channelId);
    log.info('room closed', { channelId: this.channelId.slice(0, 8) });
  }

  // ── signaling intake ───────────────────────────────────────────────────

  private async handleSignal(from: Hex, payload: VoiceSignalPayload): Promise<void> {
    if (this._status !== 'active') return;

    let peer = this.peers.get(from);
    if (!peer) {
      // No existing peer for this pubkey — `requestReset`/`bye` are no-ops.
      // Without this guard, a stray requestReset would construct a peer,
      // attach all forwarded tracks, then immediately close it (since the
      // signal it just received is "close yourself"). The browser would
      // then redial expecting fresh forwards, but the closed peer has
      // already burned the tracks. Skip the round-trip entirely.
      if (payload.type === 'requestReset' || payload.type === 'bye') {
        return;
      }
      // First contact from this pubkey. Run the dial-time gate.
      const decision = canDialRoom({
        rules: this._rules,
        members: this.membership.getMembers(this.channelId),
        hostPubkey: this.hostPubkey,
        sender: from,
      });
      if (!decision.ok) {
        log.debug('dial refused', { from: from.slice(0, 8), reason: decision.reason });
        return;
      }
      const cap = this._rules.maxParticipants ?? this.cfg.maxParticipantsPerRoom;
      if (this.peers.size >= cap) {
        log.info('dial refused: room full', { cap });
        return;
      }
      peer = this.createPeer(from);
    }

    await peer.handleSignal(payload);
  }

  private createPeer(remote: Hex): Peer {
    const peer = new Peer({
      remotePubkey: remote,
      selfPubkey: this.relay.pubkey,
      iceServers: this.buildIceServers(),
      publicIp: this.cfg.publicIp,
      rtpPortMin: this.cfg.rtpPortMin,
      rtpPortMax: this.cfg.rtpPortMax,
      send: (payload) => sendSignal(this.relay, this.channelId, remote, payload),
      events: {
        onConnected: () => {
          log.info('peer connected', {
            channel: this.channelId.slice(0, 8),
            remote: remote.slice(0, 8),
            count: this.peers.size,
          });
          // Refresh beacon so other peers see this one in `connectedTo`.
          void this.publishBeacon().catch(() => undefined);
          this.cancelEmptyTimer();
        },
        onDisconnected: () => {
          this.dropPeer(remote);
        },
        onTrack: (track, kind) => this.onPeerTrack(remote, track, kind),
        onTrackEnded: (trackId) => this.onPeerTrackEnded(remote, trackId),
      },
    });
    this.peers.set(remote, peer);

    // Forward every existing track from other peers to the newcomer.
    // The browser will see N inbound tracks; trackInfo tells it which
    // tile each maps to via `originPubkey`.
    for (const t of this.tracks.values()) {
      void peer.forwardTrack(t.track, t.origin, t.kind).catch((err) =>
        log.warn('forward to new peer failed', {
          to: remote.slice(0, 8),
          from: t.origin.slice(0, 8),
          kind: t.kind,
          err: (err as Error).message,
        }),
      );
    }
    return peer;
  }

  private dropPeer(remote: Hex): void {
    const peer = this.peers.get(remote);
    if (!peer) return;
    peer.close();
    this.peers.delete(remote);

    // Drop any tracks this peer originated.
    for (const [trackId, t] of this.tracks) {
      if (t.origin === remote) {
        this.tracks.delete(trackId);
        for (const other of this.peers.values()) {
          void other.stopForwardingTrack(remote, trackId).catch(() => undefined);
        }
      }
    }
    void this.publishBeacon().catch(() => undefined);
    this.maybeStartEmptyTimer();
  }

  // ── track plumbing ─────────────────────────────────────────────────────

  private onPeerTrack(origin: Hex, track: MediaStreamTrack, kind: VoiceTrackKind): void {
    if (!this.trackPermitted(kind)) {
      log.debug('track refused by rules', { kind, origin: origin.slice(0, 8) });
      return;
    }
    // werift's MediaStreamTrack.id is optional (set after SDP negotiation);
    // uuid is always present. Same fallback as peer.ts.
    const trackId = track.id ?? track.uuid;
    const entry: ForwardedTrack = { origin, kind, track, trackId };
    this.tracks.set(trackId, entry);
    log.info('track ingressed', {
      channel: this.channelId.slice(0, 8),
      origin: origin.slice(0, 8),
      kind,
      trackId,
    });
    // Fan out to every other peer.
    for (const [pubkey, peer] of this.peers) {
      if (pubkey === origin) continue;
      void peer.forwardTrack(track, origin, kind).catch((err) =>
        log.warn('forward failed', {
          to: pubkey.slice(0, 8),
          from: origin.slice(0, 8),
          kind,
          err: (err as Error).message,
        }),
      );
    }
  }

  private onPeerTrackEnded(origin: Hex, trackId: string): void {
    const entry = this.tracks.get(trackId);
    if (!entry || entry.origin !== origin) return;
    this.tracks.delete(trackId);
    for (const [pubkey, peer] of this.peers) {
      if (pubkey === origin) continue;
      void peer.stopForwardingTrack(origin, trackId).catch(() => undefined);
    }
    log.debug('track ended', { origin: origin.slice(0, 8), trackId });
  }

  private trackPermitted(kind: VoiceTrackKind): boolean {
    if (kind === 'audio' || kind === 'screen-audio') return true;
    if (kind === 'camera') return this._rules.video;
    if (kind === 'screen') return this._rules.screen;
    return true;
  }

  // ── publishers ─────────────────────────────────────────────────────────

  private async publishBeacon(): Promise<void> {
    const connected = Array.from(this.peers.entries())
      .filter(([, p]) => (p as unknown as { wasConnected?: boolean }).wasConnected !== false)
      .map(([k]) => k);
    await publishSfuBeacon(this.relay, this.channelId, connected);
  }

  private async publishActiveCall(): Promise<void> {
    const expiration = Math.floor(Date.now() / 1000) + ACTIVE_CALL_TTL_SECONDS;
    const tags: string[][] = [
      ['d', this.channelId],
      ['t', 'obelisk-sfu-active-call'],
      ['e', this.channelId],
      ['mode', 'sfu'],
      ['host', this.hostPubkey],
      ['cap', String(this._rules.maxParticipants ?? this.cfg.maxParticipantsPerRoom)],
      ['status', this._status],
      ['expiration', String(expiration)],
    ];
    if (this.cfg.publicUrl) tags.push(['url', this.cfg.publicUrl]);

    const content = JSON.stringify({
      rules: this._rules,
      startedAt: this.startedAt,
      participants: this.connectedPubkeys,
    });

    await this.relay.publish({
      kind: KIND_SFU_ACTIVE_CALL,
      content,
      tags,
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  // ── empty-room + endsAt ────────────────────────────────────────────────

  private maybeStartEmptyTimer(): void {
    if (this.peers.size > 0) return;
    if (this.emptyTimer) return;
    log.info('room empty — grace timer started', {
      channel: this.channelId.slice(0, 8),
      seconds: this.cfg.emptyGraceSeconds,
    });
    this.emptyTimer = setTimeout(() => {
      if (this.peers.size === 0) {
        log.info('room empty grace expired — closing', {
          channel: this.channelId.slice(0, 8),
        });
        void this.close().catch(() => undefined);
      }
    }, this.cfg.emptyGraceSeconds * 1000);
    this.emptyTimer.unref?.();
  }

  private cancelEmptyTimer(): void {
    if (this.emptyTimer) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
    }
  }

  private scheduleEndsAt(): void {
    if (this.endsAtTimer) {
      clearTimeout(this.endsAtTimer);
      this.endsAtTimer = null;
    }
    if (!this._rules.endsAt) return;
    const ms = (this._rules.endsAt - Math.floor(Date.now() / 1000)) * 1000;
    if (ms <= 0) {
      void this.close().catch(() => undefined);
      return;
    }
    this.endsAtTimer = setTimeout(() => {
      log.info('endsAt reached — closing', { channel: this.channelId.slice(0, 8) });
      void this.close().catch(() => undefined);
    }, ms);
    this.endsAtTimer.unref?.();
  }

  /**
   * werift's `RTCIceServer.urls` is a single string (not `string | string[]`
   * like the browser's). We unfurl each configured STUN/TURN URL into its
   * own entry so the same TURN credentials apply across all the URLs.
   */
  private buildIceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [];
    for (const url of this.cfg.stunUrls) {
      servers.push({ urls: url });
    }
    for (const url of this.cfg.turnUrls) {
      const entry: RTCIceServer = { urls: url };
      if (this.cfg.turnUsername) entry.username = this.cfg.turnUsername;
      if (this.cfg.turnCredential) entry.credential = this.cfg.turnCredential;
      servers.push(entry);
    }
    return servers;
  }
}
