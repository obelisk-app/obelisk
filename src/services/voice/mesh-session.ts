/**
 * The mesh topology of a voice room, as a lifecycle: enter (subscribe,
 * first beacon, cadence), the roster snapshots that drive it, exit and the
 * leave half. The work is delegated: `MeshRoster` holds what beacons and
 * hints said, `MeshDialer` decides whom to connect to under the cap and
 * tears peers down, `MeshSignalRouter` routes inbound kind 25050 signals,
 * `MeshAnnouncer` publishes beacons and control snapshots. Each reaches
 * this session as its host.
 *
 * Entered by `VoiceClient` at join (when the channel is not on an SFU) and
 * on `setExpectSfu(false)`; left on `setExpectSfu(true)` and on leave().
 * Membership stays with the client (`deps.isMember`), because NIP-29 roles
 * are not a topology concern; the pseudo-members this session admits on
 * its own (SFUs, mesh test peers, active-call hints) are exposed to the
 * client's `isMember` through `isKnownSfu`, `isKnownMeshTestPeer` and
 * `hasPassiveHint`.
 *
 * The session is the `MeshPeerHost` a `Peer`'s event wiring reaches, the
 * `MeshSignalHost` the signal router routes through and the
 * `MeshDialHost` the dial loop acts on.
 */
import { MeshSignalRouter, type MeshSignalHost } from './mesh-signals';
import { MeshDialer, type MeshDialHost } from './mesh-dial';
import { MeshRoster } from './mesh-roster';
import type { RoomState } from './room-state';
import type { LocalMedia } from './local-media';
import type { MeshSessionDeps } from './mesh-session-deps';
import type { VoiceMetrics } from './metrics';
import type { VoicePresence, VoiceSignalPayload } from './types';
import { transitiveParticipants, type VoiceTransport } from './transport';
import { DiscoveryEngine } from './discovery';
import { MeshAnnouncer } from './mesh-announce';
import { pushVoiceDebug } from './debug';
import { recordRelayAuthWait, reserveVoiceRelayCapacity } from './relay-prep';
import type { VoiceSigner } from '@/constants/voice/client';

export type { MeshSessionDeps } from './mesh-session-deps';

export class MeshSession implements MeshSignalHost, MeshDialHost {
  readonly channelId: string;
  readonly selfPubkey: string;
  readonly signer: VoiceSigner;
  readonly room: RoomState;
  readonly transport: VoiceTransport;
  readonly metrics: VoiceMetrics;
  readonly localMedia: LocalMedia;
  /** Pubkeys whose `Peer` is being constructed right now (re-entrancy guard). */
  readonly openingPeers = new Set<string>();
  /**
   * Two-source mesh peer discovery (relay beacons + control-channel
   * propagation). On every roster snapshot we replace the relay set; the
   * control set accumulates as peers' data channels report `hello` /
   * `peerAdded` / `peerRemoved`. The dial loop uses `effectivePeers()` so
   * the dex stays workable when the relay drops a participant's beacons
   * but their PC to a third party is healthy.
   */
  readonly discovery = new DiscoveryEngine();
  /** Beacons on the relay and peer snapshots over the control channels. */
  private readonly announcer: MeshAnnouncer;
  /** Inbound kind 25050 signals: the deferred queue, routing, the room cap. */
  private readonly signals: MeshSignalRouter;
  /** What beacons and hints said: the roster, SFUs, mesh test peers, hints. */
  private readonly known: MeshRoster;
  /** Whom to dial under the cap, and how a peer is torn down. */
  private readonly dialer: MeshDialer;

  private rosterUnsub: (() => void) | null = null;
  private signalsUnsub: (() => void) | null = null;
  private voiceRelayCapacityRelease: (() => void) | null = null;

  constructor(private readonly deps: MeshSessionDeps) {
    this.channelId = deps.channelId;
    this.selfPubkey = deps.selfPubkey;
    this.signer = deps.signer;
    this.room = deps.room;
    this.transport = deps.transport;
    this.metrics = deps.metrics;
    this.localMedia = deps.localMedia;
    this.known = new MeshRoster(deps.selfPubkey);
    this.signals = new MeshSignalRouter(this);
    this.dialer = new MeshDialer(this);
    this.announcer = new MeshAnnouncer({
      channelId: deps.channelId,
      transport: deps.transport,
      metrics: deps.metrics,
      room: deps.room,
      localMedia: deps.localMedia,
      remoteSigning: deps.remoteSigning,
      isJoined: () => deps.isJoined(),
      sfuPubkey: () => deps.sfuPubkey(),
      sfuActive: () => deps.sfuActive(),
      meshKnownPubkeys: () => this.meshKnownPubkeys(),
    });
  }

  // ── MeshPeerHost / MeshSignalHost / MeshDialHost ───────────────────────

  isJoined(): boolean { return this.deps.isJoined(); }
  sfuPubkey(): string | null { return this.deps.sfuPubkey(); }
  isKnownSfu(pubkey: string): boolean { return this.known.isKnownSfu(pubkey); }
  isKnownMeshTestPeer(pubkey: string): boolean { return this.known.isKnownMeshTestPeer(pubkey); }
  hasPassiveHint(pubkey: string): boolean { return this.known.hasPassiveHint(pubkey); }
  hints(): ReadonlySet<string> { return this.known.hints(); }
  roster(): readonly VoicePresence[] { return this.known.roster(); }
  isMember(pubkey: string): boolean { return this.deps.isMember(pubkey); }
  onRoomFull(): void { this.deps.onRoomFull(); }
  routeSignal(fromPubkey: string, payload: VoiceSignalPayload): Promise<void> {
    return this.signals.route(fromPubkey, payload);
  }
  /** Replay queued signals for any peer who is now a member. */
  drainDeferredSignals(): void { this.signals.drainDeferred(); }
  publishBeacon(): Promise<void> { return this.announcer.publishBeacon(); }
  scheduleBeaconRefresh(): void { this.announcer.scheduleBeaconRefresh(); }
  scheduleControlPeerSnapshot(): void { this.announcer.scheduleControlPeerSnapshot(); }
  /** The mesh pubkeys we observed ourselves; see `MeshRoster.knownPubkeys`. */
  meshKnownPubkeys(): string[] {
    return this.known.knownPubkeys(this.room.connectedPubkeys, (pk) => this.deps.isMember(pk));
  }
  roomCandidates(): string[] { return this.dialer.roomCandidates(); }
  runDialLoop(): void { this.dialer.runDialLoop(); }
  scheduleDialFromDiscovery(): void { this.dialer.scheduleDialFromDiscovery(); }
  applyControlPeerSnapshot(remotePubkey: string, peers: readonly string[]): void {
    this.dialer.applyControlPeerSnapshot(remotePubkey, peers);
  }
  tearDownPeer(pubkey: string, preservePresence = false): void {
    this.dialer.tearDownPeer(pubkey, preservePresence);
  }

  /** True while the roster or signal subscription is open. */
  get running(): boolean {
    return this.signalsUnsub !== null || this.rosterUnsub !== null;
  }

  // ── Enter / exit ───────────────────────────────────────────────────────

  /**
   * Subscribe to roster + signaling, publish the first beacon, and start
   * the periodic beacon timer. Idempotent: re-running is a no-op when the
   * subscriptions are already up. Every await in here is a window for
   * leave(); a subscription opened after the user left would stay open for
   * the life of the tab and the first beacon would advertise presence in
   * a call we are not in, so `isJoined` is re-checked after each one.
   */
  async enter(): Promise<void> {
    if (this.running) return;

    if (!this.voiceRelayCapacityRelease) {
      this.voiceRelayCapacityRelease = await reserveVoiceRelayCapacity(this.channelId);
    }
    if (!this.deps.isJoined()) {
      // leave() landed while the reservation was in flight.
      this.voiceRelayCapacityRelease?.(); this.voiceRelayCapacityRelease = null;
      return;
    }

    // Subscribe to incoming signaling first so we don't miss offers from
    // peers who learn about us via the beacon we're about to send.
    const signalsUnsub = await this.transport.subscribeSignals(
      this.channelId,
      this.selfPubkey,
      (from, payload) => this.signals.onInbound(from, payload),
    );
    if (!this.deps.isJoined()) { signalsUnsub(); return; }
    this.signalsUnsub = signalsUnsub;

    const rosterUnsub = await this.transport.subscribeRoster(this.channelId, (roster) => this.onRosterSnapshot(roster));
    if (!this.deps.isJoined()) {
      rosterUnsub();
      this.signalsUnsub?.(); this.signalsUnsub = null;
      return;
    }
    this.rosterUnsub = rosterUnsub;

    // The bridge's active-call detector is the same source that powers the
    // pre-join "people are in this call" UI. Subscribe from the mesh engine
    // too so discovery doesn't depend on the React room effect racing in
    // after join; the callback replays the current store value immediately.
    this.deps.watcher.start();

    // The AUTH wait never blocks the first beacon; it only counts the gap.
    recordRelayAuthWait(this.metrics);

    await this.announcer.publishBeacon();
    if (!this.deps.isJoined()) return;
    this.announcer.startCadence();
  }

  private onRosterSnapshot(roster: VoicePresence[]): void {
    const { newMeshTestPeers } = this.known.ingest(roster);
    for (const pk of newMeshTestPeers) {
      // A passive active-call hint can open the peer before the roster
      // beacon reveals it as a mesh test peer. Rebuild so the browser
      // becomes the offer-driving side instead of staying polite forever.
      if (this.room.peers.get(pk)?.polite) this.tearDownPeer(pk, true);
    }
    // Mesh test peers are admitted by their roster beacon, not by NIP-29
    // role updates. Signals can arrive first because we subscribe to
    // signaling before roster, so replay any queued offers as soon as the
    // marker makes them a valid peer for allowed local callers.
    this.drainDeferredSignals();
    // Compute the transitive participant set first, including peers we
    // only know about from someone else's `connectedTo` p-tags, then
    // filter by membership and hand to the dialer for cap+open logic.
    const allPubkeys = transitiveParticipants(roster);
    this.dialer.handleRoster(allPubkeys.filter((pk) => this.deps.isMember(pk)));
    // Re-evaluate the video cap whenever the roster changes: a new claim
    // from a peer whose beacon arrived after ours could push us outside
    // the leading slice and require local eviction.
    this.localMedia.enforceVideoSlotCap();
  }

  /**
   * Tear down the subscriptions, timers, and any open `Peer` instances.
   * Safe to call when mesh isn't running. Used by the mid-call mesh to
   * SFU transition (`setExpectSfu(true)`).
   */
  exit(): void {
    this.stopTimers();
    this.signalsUnsub?.(); this.signalsUnsub = null;
    this.rosterUnsub?.(); this.rosterUnsub = null;
    this.voiceRelayCapacityRelease?.(); this.voiceRelayCapacityRelease = null;
    this.known.forget();
    this.dialer.reset();
    for (const peer of this.room.peers.values()) peer.close();
    this.room.peers.clear();
    this.room.emitPeerConnectionStates();
    this.deps.watcher.stop();
  }

  /**
   * The leave() half. `wasMeshMode` is read by the client before any
   * teardown starts; when set, the terminal presence beacon goes out
   * before the subscriptions close, so the relay delivers it on the
   * sockets the other peers are still reading.
   */
  async closeForLeave(wasMeshMode: boolean): Promise<void> {
    this.stopTimers();
    this.signals.clearDeferred();
    this.dialer.reset();
    if (wasMeshMode) {
      try {
        await this.transport.publishLeavePresence(this.channelId);
        this.metrics.signals.byeViaRelay++;
      } catch (err) {
        console.warn('[voice] leave beacon failed', err);
      }
    }
    this.signalsUnsub?.();
    this.signalsUnsub = null;
    this.rosterUnsub?.();
    this.rosterUnsub = null;
    this.voiceRelayCapacityRelease?.();
    this.voiceRelayCapacityRelease = null;

    for (const peer of this.room.peers.values()) {
      try { peer.close(); } catch (err) {
        // One peer's teardown failing must not stop the rest of leave().
        console.warn('[voice] peer.close threw during leave', err);
      }
    }
    this.room.peers.clear();
    this.room.emitPeerConnectionStates();
  }

  /** Forget the roster-derived sets; after the SFU client is closed. */
  forgetRoster(): void {
    this.known.forget();
  }

  private stopTimers(): void {
    this.announcer.stop();
    this.dialer.stop();
  }

  // ── Discovery inputs ───────────────────────────────────────────────────

  /**
   * Feed the session with the bridge-level live-call detector. The
   * detector is driven by the same kind 20078 beacons shown in the
   * pre-join UI, so using it here prevents a split-brain state where the
   * room says people are present but the joined WebRTC client never dials
   * them because its dedicated ephemeral roster REQ missed the beacon.
   */
  setPassiveParticipantHints(pubkeys: readonly string[], options: { merge?: boolean } = {}): void {
    if (!this.known.setPassiveHints(pubkeys, options.merge === true)) return;
    pushVoiceDebug({
      kind: 'peer-discovered',
      payload: { source: 'active-call-hints', peers: Array.from(this.known.hints()).sort() },
    });
    if (!this.deps.isJoined() || this.deps.sfuPubkey()) return;
    this.runDialLoop();
    this.scheduleBeaconRefresh();
  }
}
