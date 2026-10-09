/**
 * How a mesh participant announces itself: presence beacons on the relay
 * (kind 20078, on a cadence plus opportunistic refreshes when the connected
 * or known peer set changes) and full peer snapshots over the open
 * `obelisk-control` data channels. Both are debounced so a flurry of
 * discoveries collapses into one publish.
 *
 * Owned by `MeshSession`, which supplies the known-peer set and decides
 * when the cadence starts and stops.
 */
import type { RoomState } from './room-state';
import type { LocalMedia } from './local-media';
import type { VoiceMetrics } from './metrics';
import type { VoiceTransport } from './transport';
import { withRateLimitBackoff } from './failure-handlers';
import { pushVoiceDebug } from './debug';
import {
  BEACON_INTERVAL_MS,
  REMOTE_SIGNER_BEACON_INTERVAL_MS,
  BEACON_BRINGUP_DELAYS_MS,
  BEACON_REFRESH_DEBOUNCE_MS,
  CONTROL_SNAPSHOT_DEBOUNCE_MS,
} from '@/constants/voice/client';

export interface MeshAnnouncerDeps {
  channelId: string;
  transport: VoiceTransport;
  metrics: VoiceMetrics;
  room: RoomState;
  localMedia: LocalMedia;
  /** NIP-46: a human/relay round trip per signed event (slower beacon cadence). */
  remoteSigning: boolean;
  isJoined(): boolean;
  sfuPubkey(): string | null;
  /** On, or entering, an SFU: no beacons go out. */
  sfuActive(): boolean;
  /** The mesh pubkeys we have observed ourselves; see `MeshSession.meshKnownPubkeys`. */
  meshKnownPubkeys(): string[];
}

export class MeshAnnouncer {
  private beaconTimer: ReturnType<typeof setTimeout> | null = null;
  private beaconRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Front-loaded extra beacon publishes scheduled when the cadence starts.
   * Held so leave() can cancel them; without this, an in-flight bring-up
   * timer would publish a beacon for a channel we've already left.
   */
  private bringupTimers: ReturnType<typeof setTimeout>[] = [];
  /** Coalesce full peer-set gossip across open WebRTC control channels. */
  private controlSnapshotTimer: ReturnType<typeof setTimeout> | null = null;

  private active = false;
  private generation = 0;
  private inFlight: Promise<void> | null = null;
  private flightGeneration = 0;
  private lastSnapshot = '';
  private refreshPending = false;

  private snapshot() {
    const connected = [...this.deps.room.connectedPubkeys].sort();
    const known = [...new Set(this.deps.meshKnownPubkeys())].sort();
    const video = [...this.deps.localMedia.videoTracks()].sort();
    return { connected, known, video, key: JSON.stringify([connected, known, video]) };
  }

  constructor(private readonly deps: MeshAnnouncerDeps) {}

  /**
   * Publish a presence beacon advertising our currently-connected peers,
   * our full known active peer set, and the outbound video tracks we're
   * sending. The connected list powers legacy transitive discovery; the
   * known-peer list lets other clients dial participants that we know about
   * but have not directly established yet. The video list lets every peer
   * compute the room-wide video count for separate camera and screen-share
   * cap enforcement. Records the failure in the metrics and the debug ring
   * before rethrowing, so the timer call sites may drop the rejection.
   */
  publishBeacon(reason: 'heartbeat' | 'state' | 'join' = 'join'): Promise<void> {
    if (!this.deps.isJoined() || this.deps.sfuActive()) return Promise.resolve();
    if (this.inFlight) {
      if (this.flightGeneration !== this.generation) {
        return this.inFlight.catch(() => {}).then(() => this.publishBeacon(reason));
      }
      this.refreshPending = true;
      return this.inFlight;
    }
    const snapshot = this.snapshot();
    if (reason === 'state' && snapshot.key === this.lastSnapshot) return Promise.resolve();
    const generation = this.generation;
    this.flightGeneration = generation;
    const operation = this.publishSnapshot(snapshot, reason, generation);
    this.inFlight = operation;
    void operation.finally(() => {
      this.inFlight = null;
      if (generation !== this.generation) return;
      this.armHeartbeat();
      if (this.refreshPending) {
        this.refreshPending = false;
        this.scheduleBeaconRefresh();
      }
    }).catch(() => {});
    return operation;
  }

  private async publishSnapshot(snapshot: ReturnType<MeshAnnouncer['snapshot']>, reason: string, generation: number): Promise<void> {
    try {
      await withRateLimitBackoff(async () => {
        if (generation !== this.generation || !this.deps.isJoined() || this.deps.sfuActive()) return;
        await this.deps.transport.publishPresenceBeacon(
          this.deps.channelId, snapshot.connected, snapshot.known, snapshot.video,
        );
      }, { metrics: this.deps.metrics });
      if (generation !== this.generation) return;
      this.lastSnapshot = snapshot.key;
      this.deps.metrics.beacons.sent++;
      pushVoiceDebug({ kind: 'beacon-sent', payload: { reason } });
    } catch (err) {
      this.deps.metrics.relay.publishFail++;
      this.deps.metrics.relay.lastError = err instanceof Error ? err.message : String(err);
      pushVoiceDebug({ kind: 'relay-error', payload: this.deps.metrics.relay.lastError });
      throw err;
    }
  }

  private armHeartbeat(): void {
    if (this.beaconTimer) clearTimeout(this.beaconTimer);
    this.beaconTimer = null;
    if (!this.active || !this.deps.isJoined()) return;
    this.beaconTimer = setTimeout(() => {
      this.beaconTimer = null;
      void this.publishBeacon('heartbeat').catch(() => {}).finally(() => {
        // SFU mode skips mesh publishing but must not leave a tight retry loop.
        if (!this.beaconTimer) this.armHeartbeat();
      });
    }, this.deps.remoteSigning ? REMOTE_SIGNER_BEACON_INTERVAL_MS : BEACON_INTERVAL_MS);
  }

  /** Start once; every successful update restarts the heartbeat countdown. */
  startCadence(): void {
    if (this.active) return;
    this.active = true;
    for (const delay of this.deps.remoteSigning ? [] : BEACON_BRINGUP_DELAYS_MS) {
      this.bringupTimers.push(setTimeout(() => {
        void this.publishBeacon('heartbeat').catch(() => {});
      }, delay));
    }
    this.armHeartbeat();
  }

  /** Coalesce state changes and discard updates identical to our last announcement. */
  scheduleBeaconRefresh(): void {
    if (!this.deps.isJoined() || this.beaconRefreshTimer) return;
    this.beaconRefreshTimer = setTimeout(() => {
      this.beaconRefreshTimer = null;
      void this.publishBeacon('state').catch(() => {});
    }, BEACON_REFRESH_DEBOUNCE_MS);
  }

  scheduleControlPeerSnapshot(): void {
    if (!this.deps.isJoined() || this.deps.sfuPubkey()) return;
    if (this.controlSnapshotTimer) return;
    this.controlSnapshotTimer = setTimeout(() => {
      this.controlSnapshotTimer = null;
      if (!this.deps.isJoined() || this.deps.sfuPubkey()) return;
      this.broadcastControlPeerSnapshot();
    }, CONTROL_SNAPSHOT_DEBOUNCE_MS);
  }

  private broadcastControlPeerSnapshot(): void {
    const peers = this.deps.meshKnownPubkeys();
    for (const peer of this.deps.room.peers.values()) {
      peer.broadcastControl({ type: 'peerSnapshot', peers, ts: Date.now() });
    }
  }

  /** Cancel the cadence, the burst and both pending debounces. */
  stop(): void {
    this.active = false;
    this.generation++;
    this.refreshPending = false;
    this.lastSnapshot = '';
    if (this.beaconTimer) { clearTimeout(this.beaconTimer); this.beaconTimer = null; }
    if (this.beaconRefreshTimer) { clearTimeout(this.beaconRefreshTimer); this.beaconRefreshTimer = null; }
    for (const t of this.bringupTimers) clearTimeout(t);
    this.bringupTimers.length = 0;
    if (this.controlSnapshotTimer) { clearTimeout(this.controlSnapshotTimer); this.controlSnapshotTimer = null; }
  }
}
