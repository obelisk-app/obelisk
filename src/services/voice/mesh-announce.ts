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
} from './constants';

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
  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  private beaconRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Front-loaded extra beacon publishes scheduled when the cadence starts.
   * Held so leave() can cancel them; without this, an in-flight bring-up
   * timer would publish a beacon for a channel we've already left.
   */
  private bringupTimers: ReturnType<typeof setTimeout>[] = [];
  /** Coalesce full peer-set gossip across open WebRTC control channels. */
  private controlSnapshotTimer: ReturnType<typeof setTimeout> | null = null;

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
  async publishBeacon(): Promise<void> {
    if (!this.deps.isJoined() || this.deps.sfuActive()) return;
    const videoTracks = this.deps.localMedia.videoTracks();
    try {
      await withRateLimitBackoff(
        () => this.deps.transport.publishPresenceBeacon(
          this.deps.channelId,
          [...this.deps.room.connectedPubkeys],
          this.deps.meshKnownPubkeys(),
          videoTracks,
        ),
        { metrics: this.deps.metrics },
      );
      this.deps.metrics.beacons.sent++;
      pushVoiceDebug({ kind: 'beacon-sent' });
    } catch (err) {
      this.deps.metrics.relay.publishFail++;
      this.deps.metrics.relay.lastError = err instanceof Error ? err.message : String(err);
      pushVoiceDebug({ kind: 'relay-error', payload: this.deps.metrics.relay.lastError });
      throw err;
    }
  }

  /**
   * After the first beacon: the bring-up burst, then the steady cadence.
   * Beacons are ephemeral, so a peer whose relay session was still
   * completing NIP-42 AUTH on our first beacon needs several more chances
   * within the user's "is this stuck?" window before the 15 s steady-state
   * cadence takes over. A remote signer skips the burst: every publish is
   * a human/relay round trip.
   */
  startCadence(): void {
    for (const delay of this.deps.remoteSigning ? [] : BEACON_BRINGUP_DELAYS_MS) {
      this.bringupTimers.push(
        setTimeout(() => { void this.publishBeacon().catch(() => {}); }, delay),
      );
    }
    this.beaconTimer = setInterval(() => {
      void this.publishBeacon().catch(() => {});
    }, this.deps.remoteSigning ? REMOTE_SIGNER_BEACON_INTERVAL_MS : BEACON_INTERVAL_MS);
  }

  /**
   * Schedule a beacon refresh after a short debounce. Called when our
   * connected-peer set changes so the propagation latency for transitive
   * discovery is one debounce window, not one full BEACON_INTERVAL_MS.
   */
  scheduleBeaconRefresh(): void {
    if (!this.deps.isJoined()) return;
    if (this.beaconRefreshTimer) return;
    this.beaconRefreshTimer = setTimeout(() => {
      this.beaconRefreshTimer = null;
      if (!this.deps.isJoined()) return;
      void this.publishBeacon().catch(() => {});
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
    if (this.beaconTimer) { clearInterval(this.beaconTimer); this.beaconTimer = null; }
    if (this.beaconRefreshTimer) { clearTimeout(this.beaconRefreshTimer); this.beaconRefreshTimer = null; }
    for (const t of this.bringupTimers) clearTimeout(t);
    this.bringupTimers.length = 0;
    if (this.controlSnapshotTimer) { clearTimeout(this.controlSnapshotTimer); this.controlSnapshotTimer = null; }
  }
}
