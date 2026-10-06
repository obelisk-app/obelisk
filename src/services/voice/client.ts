// Build identity - bumped per-deploy to force turbopack to mint a fresh
// chunk filename for this module. Without it, sticky local caches
// (extension content scripts, HTTPS-inspecting proxies, aggressive disk
// caches) can pin the previous build's voice client at the same URL
// indefinitely. Side-effect (window assignment) so the constant
// survives tree-shaking - turbopack would otherwise drop a `void`'d
// constant and produce the same chunk hash as before.
if (typeof globalThis !== 'undefined') {
  (globalThis as { __obeliskVoiceBuild?: string }).__obeliskVoiceBuild =
    '2026-05-24T01:00:00Z-voice-video-autoplay-retry';
}

/**
 * VoiceClient is the one surface the app sees of a call in a channel. It
 * owns the join/leave lifecycle and the topology choice, and delegates the
 * rest: `MeshSession` (beacons, discovery, one `Peer` per remote, signal
 * routing), `SfuSession` (the mediasoup driver and its recovery),
 * `LocalMedia` (capture and the video-slot cap), `RoomState` (what both
 * topologies write and every UI-facing emit), `RoomMembership` (NIP-29
 * roles and the open flag) and `ActiveCallWatcher` (the bridge's kind
 * 31314 entry). Pure-Nostr; no server dependency.
 */
import type { MeshSession } from './mesh-session';
import type { ActiveCallWatcher } from './active-call-watcher';
import type { SfuSession } from './sfu-session';
import { getSelfPubkey, type VoiceTransport } from './transport';
import type { LocalMedia } from './local-media';
import { voiceStoreSink, type VoiceUiSink } from './ui-sink';
import { resumeSharedAudioContext } from './speaking-detector';
import type { RoomState, VoiceClientEvents } from './room-state';
import { RoomMembership } from './membership';
import { assembleVoiceRoom } from './client-assembly';
import { TopologySwitch } from './topology-switch';
import { VoiceError } from './errors';
import type { VoiceClientOptions } from './client-options';
import { VoiceClientSurface } from './client-surface';
// The owner-facing types live with the state they describe.
export type { RemoteTrack, VoiceClientEvents } from './room-state';
export type { VoiceClientOptions } from './client-options';
import { emptyVoiceMetrics, type VoiceMetrics } from './metrics';
import { setVoiceMetricsRef } from './debug';
// Kept on the client's public surface for existing importers.
export { SIGNER_PEER_BUDGET, type VoiceSigner } from './constants';
import { installBeforeUnloadHandler, type UnloadHandlerHandle } from './failure-handlers';

/**
 * The snapshot getters, membership updates and media controls are inherited
 * from `VoiceClientSurface` (`client-surface.ts`); this class owns the
 * collaborators and the join/leave lifecycle.
 */
export class VoiceClient extends VoiceClientSurface {
  readonly channelId: string;
  readonly selfPubkey: string;
  protected readonly ui: VoiceUiSink;
  private readonly transport: VoiceTransport;

  /** NIP-29 members, admins and the open flag; see `membership.ts`. */
  protected readonly membership: RoomMembership;
  /** The mesh/SFU decision at join and the live flip; see `topology-switch.ts`. */
  protected readonly topology: TopologySwitch;
  /** What both topologies write and every UI-facing emit; see `room-state.ts`. */
  protected readonly room: RoomState;
  /** Beacons, discovery, the dial loop, one `Peer` per remote; see `mesh-session.ts`. */
  protected readonly mesh: MeshSession;
  /** The mediasoup driver, its bootstrap ladder and recovery; see `sfu-session.ts`. */
  protected readonly sfu: SfuSession;
  /** The bridge's kind 31314 entry for this channel; see `active-call-watcher.ts`. */
  private readonly activeCallWatcher: ActiveCallWatcher;
  /** Capture, the permission races and the video-slot cap; see `local-media.ts`. */
  protected readonly localMedia: LocalMedia;

  private unloadHandler: UnloadHandlerHandle | null = null;
  private joined = false;

  /**
   * Observable counters for the mesh voice layer. Exposed via
   * `window.__obeliskVoiceMetrics` so the Playwright harness and the
   * `?debug=voice` overlay can assert on previously-silent failure modes.
   * Mutated in place, never reassigned, so subscribers see updates
   * without needing change events.
   */
  readonly metrics: VoiceMetrics = emptyVoiceMetrics();

  /** Roster / signal subs currently backing off after a rate-limit CLOSE. */
  private degradedSubscriptions = new Set<'roster' | 'signals'>();

  constructor(channelId: string, options: VoiceClientOptions = {}) {
    super();
    this.channelId = channelId;
    this.ui = options.uiSink ?? voiceStoreSink;
    const pk = getSelfPubkey();
    if (!pk) throw new VoiceError('notLoggedIn', 'Not logged in to nostr');
    this.selfPubkey = pk;
    this.membership = new RoomMembership(pk, options);
    const built = assembleVoiceRoom(channelId, pk, options, this.ui, this.metrics, {
      isJoined: () => this.joined,
      isMember: (pubkey) => this.isMember(pubkey),
      expectSfu: () => this.topology.expectSfu,
      onRoomFull: () => {
        void this.leave().catch((err) => console.warn('[voice] leave after room-full failed', err));
      },
      onSubscriptionDegraded: (which, degraded) => {
        if (!this.joined) return;
        if (degraded) this.degradedSubscriptions.add(which);
        else this.degradedSubscriptions.delete(which);
        this.ui.setSignalingDegraded(this.degradedSubscriptions.size > 0);
      },
    });
    this.transport = built.transport;
    this.room = built.room;
    this.localMedia = built.localMedia;
    this.activeCallWatcher = built.watcher;
    this.sfu = built.sfu;
    this.mesh = built.mesh;
    this.topology = new TopologySwitch({
      channelId,
      room: this.room,
      mesh: this.mesh,
      sfu: this.sfu,
      expectSfu: options.expectSfu === true,
      isJoined: () => this.joined,
    });
    setVoiceMetricsRef(this.metrics);
    if (typeof window !== 'undefined') {
      (window as unknown as { __obeliskVoiceSelfPubkey?: string }).__obeliskVoiceSelfPubkey = pk;
    }
  }

  /** Swap the event listeners - used when a fresh React owner picks up an
   *  already-running call after navigating back. */
  setEvents(events: VoiceClientEvents): void {
    this.room.events = events;
  }

  isJoined(): boolean {
    return this.joined;
  }

  async join(): Promise<void> {
    if (this.joined) return;
    if (!this.canJoin()) {
      throw new VoiceError('notMember', 'You are not a member of this voice channel.');
    }
    this.joined = true;

    // The Join button is the user gesture that lets us resume the shared
    // AudioContext used by SpeakingDetector. Browsers create it suspended.
    void resumeSharedAudioContext();

    // Join starts listening-only. The user can publish their mic explicitly
    // from the mic button; presence, beacons, and remote audio do not depend
    // on microphone permission.
    this.localMedia.emitLocal();

    try {
      if (await this.topology.enter() === 'mesh') this.installUnloadHandler();
    } catch (err) {
      // A join that rejects must leave the client exactly as it was before
      // the call: `joined` false, nothing subscribed, nothing reserved. With
      // `joined` left true the client could neither be retried (join()
      // returns at the top) nor left (VoiceRoom's remount reads isJoined()
      // and shows a call that is not running), and a mesh join that failed
      // after subscribeSignals kept that REQ and the relay reservation open.
      // `leave()` during the attempt already ran this teardown (and flipped
      // `joined`), so only tear down what is still ours.
      if (this.joined) {
        this.joined = false;
        await this.tearDown();
      }
      throw err;
    }
  }

  /**
   * Tab close / refresh: synchronous best-effort goodbye so the other
   * side learns within ~10 ms instead of waiting for the data-channel
   * heartbeat (7 s) or the relay-side beacon expiry (~30 s). Each
   * peer.close() inside leave() sends a control-channel bye
   * synchronously through the open data channel before pc.close(), so the
   * bye reaches the remote even if the relay refuses our final kind 25050.
   */
  private installUnloadHandler(): void {
    this.unloadHandler = installBeforeUnloadHandler({
      onUnload: () => {
        this.metrics.peers.tornDownByUnload += this.room.peers.size;
        // leave() returns a Promise we can't await during unload; fire it
        // and let the synchronous portion (peer.close -> control bye) run
        // before the page goes away.
        // Nothing can read a log once the page is gone; nothing to report.
        void this.leave().catch(() => {});
      },
    });
  }

  async leave(): Promise<void> {
    if (!this.joined) return;
    this.joined = false;
    await this.tearDown();
    this.room.events.onLeft?.();
  }

  /**
   * Everything between flipping `joined` and `onLeft`: release media, stop
   * timers, close subscriptions, peers and the SFU client, clear the room
   * state and the UI mirror. Shared by `leave()` and by a `join()` that
   * failed; the latter does not fire `onLeft`, because a call that never
   * started is not one the user left.
   */
  private async tearDown(): Promise<void> {
    const wasMeshMode = this.mesh.running && !this.sfu.active;
    // Privacy first: release the microphone, camera and screen (and
    // invalidate every acquisition still waiting on a permission prompt)
    // before anything below that can await or throw. Everything after this
    // line is bookkeeping; a listener that throws or a relay that hangs
    // must not be able to keep the tab's capture indicator lit.
    this.localMedia.releaseAll();
    this.sfu.cancelRejoin();
    if (this.degradedSubscriptions.size > 0) {
      this.degradedSubscriptions.clear();
      this.ui.setSignalingDegraded(false);
    }
    if (this.unloadHandler) { this.unloadHandler.uninstall(); this.unloadHandler = null; }
    // Timers, the terminal beacon, the subscriptions, then the peers.
    await this.mesh.closeForLeave(wasMeshMode);
    this.activeCallWatcher.stop();
    await this.sfu.closeForLeave();
    this.mesh.forgetRoster();
    // Roster, connected set, remote tracks (emitted empty) and every
    // speaking detector: the orbs go dark through the sink.
    this.room.reset();
    this.ui.clearLocalMutes();

    this.localMedia.emitLocal();
  }

  /**
   * Publish a presence beacon now. Public so multi-client integration
   * tests can drive each node's beacon deterministically; the production
   * cadence is timer-driven inside the mesh session.
   */
  publishBeacon(): Promise<void> {
    return this.mesh.publishBeacon();
  }
}

// Test/diagnostic surface - exposes the VoiceClient constructor on window
// so the Playwright voice harness can drive a real mesh peer without
// instantiating the VoiceRoom UI (which has its own membership-gate UX
// that depends on real NIP-29 group metadata being present on the relay).
// Production code never reads from this; UI components import VoiceClient
// directly via the module graph.
if (typeof window !== 'undefined') {
  (window as unknown as { __obeliskVoiceClient?: typeof VoiceClient }).__obeliskVoiceClient = VoiceClient;
}
