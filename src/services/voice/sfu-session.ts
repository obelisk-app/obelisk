/**
 * The SFU topology of a voice room: one `SfuClient` (mediasoup-client over
 * kind 25050 RPC) standing in for every other participant.
 *
 * Entered by `VoiceClient` after `pickSfu` resolved a pubkey (at join, on
 * `setExpectSfu(true)`, or on the rejoin after a remote closure); never by
 * a beacon. Owns the bootstrap retry ladder, the failure path that keeps
 * `voice-sfu` channels on the SFU instead of falling back to mesh, and
 * the recovery after the SFU closes its room.
 */
import type { SfuClient } from './sfu-client';
import { pickSfu, type SfuAdvertisement } from './sfu-control';
import type { RoomState } from './room-state';
import type { LocalMedia } from './local-media';
import type { ActiveCallWatcher } from './active-call-watcher';
import type { VoiceMetrics } from './metrics';
import { startSfuClient } from './sfu-bootstrap';
import { SFU_REJOIN_DELAY_MS } from '@/constants/voice/client';

export interface SfuSessionDeps {
  room: RoomState;
  channelId: string;
  selfPubkey: string;
  metrics: VoiceMetrics;
  localMedia: LocalMedia;
  /** Armed once the client is up; the closure handler reads it. */
  watcher: ActiveCallWatcher;
  isJoined(): boolean;
  expectSfu(): boolean;
}

export class SfuSession {
  /**
   * The pubkey `pickSfu` resolved for this channel. Set by `enter` before
   * the bootstrap (so mute, echo suppression and signal routing can reason
   * about the topology during the handshake), cleared by `failSfuStart`,
   * `exit`, `handleRemoteClosure` and `closeForLeave`. While set there is
   * no mesh dial loop at all.
   */
  pubkey: string | null = null;
  /**
   * Mediasoup-client driver for the active SFU. One instance per bootstrap
   * attempt; torn down by the same four paths as `pubkey`.
   */
  client: SfuClient | null = null;
  /** Pending reconnect after the SFU closed its room; see `scheduleRejoin`. */
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: SfuSessionDeps) {}

  private get room(): RoomState { return this.deps.room; }
  private get events() { return this.deps.room.events; }

  /** True while the room is on (or entering) an SFU. */
  get active(): boolean {
    return this.pubkey !== null || this.client !== null;
  }

  /**
   * Flip topology to SFU mode. Sets `pubkey`, stands up the `SfuClient`,
   * and only then fires `onTopologyChange(sfuPubkey)`. On `start()` failure
   * `failSfuStart` clears the state, fires `onTopologyChange(null)`,
   * surfaces `onError` and rethrows; there is no mesh fallback.
   */
  async enter(sfuPubkey: string, resolvedSfu?: SfuAdvertisement): Promise<void> {
    if (this.pubkey === sfuPubkey && this.client) return;

    if (this.client) {
      // Await close so the prior client's `leave` RPC actually transmits
      // before we open a new connection; otherwise the SFU may still hold
      // our prior peer entry when our new SfuClient.start() races in,
      // double-fanning peerJoined notifications and producing roster
      // flicker.
      // close() guards every step itself; the pivot must go on regardless.
      try { await this.client.close(); } catch { /* close() is best-effort by contract */ }
      this.client = null;
    }
    // Drop any prior watcher - we're switching SFUs (or re-entering after
    // a closure-driven teardown). The new watcher arms after startSfuClient.
    this.deps.watcher.stop();
    // Track the *intended* SFU pubkey so other paths (peer mute, echo
    // suppression) can reason about the topology - but do NOT fire
    // onTopologyChange yet. The UI badge interprets a non-null pubkey
    // as "SFU connected"; firing here would lie for the entire RPC
    // handshake window and stay stuck on "connected" if the handshake
    // times out. startSfuClient (`sfu-bootstrap.ts`) handles its own failure cleanup.
    this.pubkey = sfuPubkey;
    await startSfuClient(this, this.deps, sfuPubkey, resolvedSfu);
    // leave() during the bootstrap already tore the client down; do not
    // re-arm the watcher or tell the UI we are connected.
    if (!this.deps.isJoined()) return;
    // SfuClient is up - arm the kind 31314 watcher so we react fast when
    // the SFU room closes (graceful restart, watchdog auto-heal, 1h cap).
    this.deps.watcher.start();
    try { this.events.onTopologyChange?.(sfuPubkey); } catch (err) {
      console.warn('[voice] onTopologyChange handler threw', err);
    }
  }

  /**
   * Tear down the active SFU client and drop SFU-attributed state. Used
   * by the SFU→mesh transition (`setExpectSfu(false)` mid-call). Does NOT
   * start mesh subscriptions - the caller decides whether to re-enter mesh.
   */
  exit(): void {
    const from = this.pubkey;
    if (this.client) {
      // Topology pivot to mesh - fire-and-forget the close. We don't
      // need to await the leave RPC here because we're not opening a
      // new SFU connection; mesh peers are about to provide media via
      // a different path. close() is guarded throughout.
      void this.client.close().catch(() => undefined);
      this.client = null;
    }
    if (from) {
      // Drop SFU-attributed remote tracks (and their speaking detectors) so
      // the next topology re-emits fresh ones rather than orphaning them on
      // a closed peer.
      this.room.removeRemoteTracksFor(from);
      this.room.connectedPubkeys.delete(from);
    }
    this.pubkey = null;
    this.room.setRoster([]);
  }

  /**
   * SFU told us (via kind 31314 status=closed) that the call ended. Tear
   * down the dead SfuClient, fire onTopologyChange(null) so the supervisor
   * in VoiceRoom republishes `start`, and schedule the reconnect.
   */
  handleRemoteClosure(): void {
    if (!this.client) return;
    console.warn('[voice] SFU room closed remotely, recovering');
    const client = this.client;
    const sfuPubkey = this.pubkey;
    this.client = null;
    this.pubkey = null;
    if (sfuPubkey) {
      // SfuClient.close() clears its own consumer map before closing the
      // transports, so it never reports the forwarded tracks as ended.
      // Drop them here, with their speaking detectors, or every tile keeps
      // its last frame and each detector keeps polling a dead stream.
      this.room.removeRemoteTracksFor(sfuPubkey);
      this.room.connectedPubkeys.delete(sfuPubkey);
    }
    // Drop the watcher - the next enter() will re-arm it. Leaving it
    // armed would re-fire on every subsequent empty snapshot until the
    // bridge sees a fresh active entry.
    this.deps.watcher.stop();
    // 0-budget close: the SFU is gone, so awaiting a leave RPC just
    // burns 500ms waiting for a timeout. Mirror the failSfuStart path.
    void client.close(0).catch(() => undefined);
    try { this.events.onTopologyChange?.(null); } catch (err) {
      console.warn('[voice] onTopologyChange handler threw', err);
    }
    this.scheduleRejoin();
  }

  /**
   * After the SFU closed its room, reconnect once the supervisor has had a
   * chance to republish `start`. Without this the client sat in a state
   * with no SFU and no mesh (a `voice-sfu` channel never subscribes to the
   * beacon roster), and the call stayed silent until the user rejoined.
   * Behaviour flagged for sign-off in round 7: reconnects after 2 s.
   */
  private scheduleRejoin(): void {
    if (this.rejoinTimer || !this.deps.isJoined() || !this.deps.expectSfu()) return;
    this.rejoinTimer = setTimeout(() => {
      this.rejoinTimer = null;
      if (!this.deps.isJoined() || !this.deps.expectSfu() || this.active) return;
      void (async () => {
        const picked = await pickSfu(this.deps.channelId).catch((err) => {
          console.warn('[voice] pickSfu threw on SFU rejoin', err);
          return null;
        });
        if (!this.deps.isJoined() || this.active) return;
        if (!picked) {
          try { this.events.onError?.('sfuClosed'); }
          catch (err) { console.warn('[voice] onError handler threw', err); }
          return;
        }
        await this.enter(picked.pubkey, picked).catch((err) => {
          // failSfuStart already surfaced onError and onTopologyChange(null).
          console.warn('[voice] SFU rejoin failed', err);
        });
      })();
    }, SFU_REJOIN_DELAY_MS);
  }

  /** Drop a pending reconnect. `leave()` calls this before its first await. */
  cancelRejoin(): void {
    if (this.rejoinTimer) { clearTimeout(this.rejoinTimer); this.rejoinTimer = null; }
  }

  /** The leave() half: cancel the rejoin, close the client within its budget. */
  async closeForLeave(): Promise<void> {
    this.cancelRejoin();
    if (this.client) {
      // Bounded await so the SFU sees our `leave` RPC before its
      // empty-grace timer / RTP reaper has to discover us via timeout.
      // Capped at ~500 ms so a slow relay can't deadlock channel
      // switches; DTLS close-notify on transport.close() is the
      // deterministic fallback past that budget.
      try { await this.client.close(); } catch { /* close() is best-effort by contract; leave must finish */ }
      this.client = null;
    }
    this.pubkey = null;
  }
}
