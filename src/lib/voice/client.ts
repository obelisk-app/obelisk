/**
 * VoiceClient orchestrates a peer mesh inside a single channel:
 *  - publishes presence beacons on a 15s cadence + opportunistically when
 *    the local connected-peer set changes (so transitive discovery on
 *    other clients converges within one beacon hop, not 15 s)
 *  - subscribes to the roster + opens a `Peer` per remote pubkey
 *  - subscribes to incoming signaling and routes to the right `Peer`
 *  - manages local mic / camera / screen tracks across all peers
 *  - drives RMS-based speaking detection for the local mic and every
 *    incoming remote audio track, mirroring transitions into the voice
 *    store so the UI's speaking-orb pulses without round-tripping
 *
 * Pure-Nostr; no `server.ts` dependency. 5-person calls fit comfortably
 * in the 6-participant cap with one slot of headroom.
 */
import { Peer } from './peer';
import { SfuClient } from './sfu-client';
import type { SfuRemoteTrack } from './sfu-client';
import { pickSfu } from './sfu-control';
import type {
  VoicePresence,
  VoiceSignalPayload,
  VoiceTrackKind,
  VoiceQualityHint,
  VideoSlotKind,
} from './types';
import {
  publishPresenceBeacon,
  subscribeRoster,
  sendSignal,
  subscribeSignals,
  getSelfPubkey,
  transitiveParticipants,
} from './transport';
import { getPreset, MIC_CONSTRAINTS, type VideoQuality } from './quality';
import { useVoiceStore } from '@/store/voice';
import { SpeakingDetector, resumeSharedAudioContext } from './speaking-detector';

const BEACON_INTERVAL_MS = 15_000;
/**
 * Aggressive beacon burst right after `join()`. NIP-29 voice beacons are
 * ephemeral — relays don't backfill them — so a peer who joined a few
 * seconds before us would otherwise be invisible until their next 15 s
 * tick. Firing additional publishes in the first ~12 s collapses that
 * worst-case discovery latency to a few seconds while keeping the
 * total relay traffic bounded (six small events vs ~one event every
 * 15 s in steady state).
 *
 * Time origin = right after the first `publishBeacon()` returns from
 * `join()`. The schedule is intentionally front-loaded: each step is
 * roughly 2× the previous so a slow NIP-42 AUTH has multiple chances
 * to land a beacon before we settle into the steady-state cadence.
 */
const BEACON_BRINGUP_DELAYS_MS = [500, 1500, 3500, 7000, 12_000];
/**
 * Audio-mesh cap. 8 participants × 7 outbound audio streams each = 56 PCs
 * worst-case room-wide; that's still inside what a typical home upstream
 * can carry at Opus 64–128 kbps per stream.
 */
const MAX_PARTICIPANTS = 8;
/**
 * Room-wide cap on simultaneous outbound video tracks across all peers
 * (camera + screen-share counted together — e.g. 2 cameras + 2 screens, or
 * 4 cameras, or 1 camera + 3 screens). Beyond this, mesh uplink becomes
 * the binding constraint long before the audio mesh does. Race-overflow
 * resolution is deterministic via `(beaconCreatedAt asc, pubkey asc)` —
 * the holders outside the leading slice locally evict their video.
 */
const MAX_VIDEO_SLOTS = 4;
/**
 * Debounce for opportunistic beacon refresh after a connection-state change.
 * Coalesces a flurry of `connected` transitions during initial mesh formation
 * into a single beacon publish so we don't spam the relay.
 */
const BEACON_REFRESH_DEBOUNCE_MS = 250;

export interface RemoteTrack {
  /**
   * Logical origin — whose participant tile this track renders in. In
   * mesh, this equals the RTC remote. In SFU mode, it's the participant
   * the SFU is forwarding from (set by `trackInfo.originPubkey`).
   */
  pubkey: string;
  /**
   * The RTC remote that delivered this track over its PC. Same as
   * `pubkey` in mesh; the SFU's pubkey in SFU mode. Used by teardown
   * to clean up forwarded tracks when the underlying PC drops.
   */
  viaPubkey: string;
  trackId: string;
  kind: VoiceTrackKind;
  stream: MediaStream;
}

export interface VoiceClientEvents {
  onParticipantsChange?(pubkeys: string[]): void;
  onRemoteTracksChange?(tracks: RemoteTrack[]): void;
  onLocalTracksChange?(local: { mic: boolean; camera: boolean; screen: boolean }): void;
  /**
   * Topology change — null means "back on mesh", a hex pubkey means "now
   * forwarding through this SFU". Fires every time `setSfuMode` flips,
   * including the first time an SFU's beacon shows up. UI uses this to
   * tell users whether their `voice-sfu` channel actually upgraded to
   * the SFU or fell back to mesh because the SFU rejected the start.
   */
  onTopologyChange?(sfuPubkey: string | null): void;
  onError?(message: string): void;
  onLeft?(reason?: string): void;
}

export interface VoiceClientOptions {
  /**
   * Authoritative member list for this channel (NIP-29 kind 39002 pubkeys).
   * Non-members' presence beacons and signaling events are dropped, and the
   * local user must be in this list to publish a beacon. An empty list is
   * treated as "open room" — only useful for ad-hoc / dev rooms; production
   * callers should always pipe the real member list through here.
   */
  members?: readonly string[];
  /**
   * Whether the call should run on an SFU.
   *
   * `true` — at `join()`, ask `pickSfu(channelId)` for the active SFU
   *          (per-channel pin → env override → kind 31313 advertisement)
   *          and switch to SFU mode if found. Used for `voice-sfu`
   *          channels.
   * `false` (default) — stay in mesh. `pickSfu` is never consulted, so
   *          stray SFU advertisements can't hijack the topology.
   *
   * Mutable post-construction via {@link VoiceClient.setExpectSfu} so a
   * channel-kind reclassification flips the live call without requiring
   * a teardown/rejoin.
   */
  expectSfu?: boolean;
  /**
   * Channel admins (NIP-29 kind 39001 pubkeys). Only events signed by these
   * pubkeys are honored as moderator force-actions.
   */
  admins?: readonly string[];
  /**
   * NIP-29 `["open"]` flag from the channel's kind 39000 metadata. When
   * true, anyone may join regardless of `members`/`admins` — passing the
   * member list is still useful so admin badges render correctly, but the
   * gate on join/canJoin becomes unconditional.
   */
  open?: boolean;
  events?: VoiceClientEvents;
}

export class VoiceClient {
  readonly channelId: string;
  readonly selfPubkey: string;
  private events: VoiceClientEvents;
  private readonly sessionId = randomId();

  private members: ReadonlySet<string>;
  private admins: ReadonlySet<string>;
  // Mutable so the live client can pick up a channel flipping open ↔ closed
  // without being torn down. NIP-29 admins occasionally republish kind 39000
  // with a different `["open"]` state and any in-call peers should follow.
  private openRoom: boolean;
  /**
   * Mirrors `VoiceClientOptions.expectSfu`. Mutable so a channel that
   * gets reclassified between `voice` and `voice-sfu` mid-call flips the
   * topology without forcing the user to rejoin.
   */
  private expectSfu: boolean;

  private peers = new Map<string, Peer>();
  private remoteTracks = new Map<string, RemoteTrack>(); // key: trackId
  private rosterPubkeys: string[] = [];
  /**
   * SFU mode marker. Set when any beacon in `currentRoster` carries the
   * `["sfu","1"]` topology tag; cleared otherwise. While set, the dial
   * loop opens at most ONE PC (to this pubkey) instead of meshing across
   * every other participant. See `setSfuMode` and docs/sfu-system.md §5.
   */
  private sfuPubkey: string | null = null;
  /**
   * Mediasoup-client driver for the active SFU. Replaces the werift-era
   * `Peer` class for the SFU peer slot. Mesh peers continue to use `Peer`.
   * Lifecycle: created in `setSfuMode(pubkey)`, torn down on `setSfuMode(null)`
   * or when the channel is left.
   */
  private sfuClient: SfuClient | null = null;
  /**
   * Pubkeys that have published a beacon with `["sfu","1"]` for this
   * channel. SFUs are infrastructure, not participants — they should be
   * trusted through the membership filter without operators having to
   * manually add the SFU's pubkey to every channel's NIP-29 member list.
   * The SFU's signed beacon is the credential; the SFU's own allow-list
   * (config-side) gates who can actually start calls on it.
   *
   * Refreshed from `currentRoster` on every snapshot — when the SFU's
   * beacon expires, its pubkey leaves this set on the next sweep.
   *
   * Trust caveat: a malicious actor could publish a beacon with
   * `["sfu","1"]` to claim SFU status. The hardening pair is the SFU's
   * kind 31314 active-call event (only published when an authorized host
   * actually started a call); v0 trusts the beacon flag alone.
   */
  private knownSfuPubkeys = new Set<string>();
  /**
   * Pubkeys we currently have RTCPeerConnections in `connected` state with.
   * Drives the `connectedTo` field of our own beacon — every other peer who
   * sees our beacon learns to dial these pubkeys, even if those pubkeys'
   * own beacons were dropped by the relay.
   */
  private connectedPubkeys = new Set<string>();
  /**
   * Latest known beacon-roster snapshot for this channel. Used to compute
   * the room-wide video-slot count when local video is starting / running.
   * Updated on every `subscribeRoster` callback and on each local video
   * mutation (so race resolution sees its own updates immediately).
   */
  private currentRoster: readonly VoicePresence[] = [];
  /**
   * Wall-clock seconds when each of our local video tracks claimed its
   * slot. Race resolution sorts by `(claimedAt asc, pubkey asc)` so an
   * older track wins against a later one — matches the relay-sourced
   * `createdAt` ordering used for remote claims.
   */
  private localVideoClaimedAt = new Map<VideoSlotKind, number>();
  private beaconRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  private micTrack: MediaStreamTrack | null = null;
  private camTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private screenAudioTrack: MediaStreamTrack | null = null;

  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * Front-loaded extra beacon publishes scheduled at `join()` time. Held so
   * `leave()` can cancel them — without this, an in-flight bring-up timer
   * would publish a beacon for a channel we've already left.
   */
  private bringupTimers: ReturnType<typeof setTimeout>[] = [];
  /**
   * Pubkeys we've seen in any roster snapshot since join. Used to detect a
   * NEW peer's first appearance, which schedules a beacon refresh so that
   * peer learns about us within ~250 ms instead of waiting up to a full
   * `BEACON_INTERVAL_MS` for our next periodic publish.
   */
  private seenRosterPubkeys = new Set<string>();
  private rosterUnsub: (() => void) | null = null;
  private signalsUnsub: (() => void) | null = null;
  private joined = false;
  private deafened = false;
  /**
   * Speaking-activity detectors. Keyed by pubkey: the local detector lives
   * under `selfPubkey` and each remote audio track gets a detector under
   * its peer's pubkey. We keep them addressable so micEnabled toggles, peer
   * teardown, and remote-track-end can all stop the right one.
   */
  private speakingDetectors = new Map<string, SpeakingDetector>();

  constructor(channelId: string, options: VoiceClientOptions = {}) {
    this.channelId = channelId;
    this.events = options.events ?? {};
    this.members = new Set(options.members ?? []);
    this.admins = new Set(options.admins ?? []);
    // Honor the explicit `open` flag from kind 39000 first. Falling back
    // to "no members provided" preserves the dev / ad-hoc-room behavior
    // but is no longer the only path — production callers wire the
    // group's `isOpen` through so an open public channel doesn't reject
    // non-members just because their kind 9000 hasn't landed locally.
    this.openRoom = options.open === true
      || !options.members
      || options.members.length === 0;
    // Default `false` — mesh-only unless the caller explicitly opts in
    // via channel kind. Production callers (VoiceRoom) pass
    // `expectSfu: channelKind === 'voice-sfu'`, so the default only
    // affects ad-hoc / test constructions which should be mesh.
    this.expectSfu = options.expectSfu === true;
    const pk = getSelfPubkey();
    if (!pk) throw new Error('Not logged in to nostr');
    this.selfPubkey = pk;
  }

  /** Swap the event listeners — used when a fresh React owner picks up an
   *  already-running call after navigating back. */
  setEvents(events: VoiceClientEvents): void {
    this.events = events;
  }

  /** Snapshot helpers so a freshly-bound owner can hydrate UI state without
   *  waiting for the next event tick. */
  getParticipants(): string[] {
    return [...this.rosterPubkeys];
  }
  getRemoteTracks(): RemoteTrack[] {
    return Array.from(this.remoteTracks.values());
  }
  isJoined(): boolean {
    return this.joined;
  }
  /**
   * Currently-active SFU pubkey for this channel, or null in mesh mode.
   * UI uses this to render an "SFU mode" badge or hide the participant
   * count from including the SFU. Updated whenever the roster snapshot
   * gains/loses a beacon with `["sfu","1"]`.
   */
  getSfuPubkey(): string | null {
    return this.sfuPubkey;
  }

  /**
   * Toggle the open-room flag at runtime. Used when the channel's kind
   * 39000 metadata arrives (or is republished) after the client was
   * constructed — without this, an early gate decision permanently freezes
   * the openness state and either over-restricts (drops every remote peer
   * because the member list hadn't propagated yet) or under-restricts.
   */
  setOpen(open: boolean): void {
    if (this.openRoom === open) return;
    this.openRoom = open;
    // Re-run the membership trim if we just locked the room down so any
    // already-connected non-members are dropped immediately.
    if (!open) {
      for (const pk of Array.from(this.peers.keys())) {
        if (!this.isMember(pk)) {
          this.tearDownPeer(pk);
        }
      }
    }
  }

  /**
   * Live-flip whether the call should run on an SFU. Used when the
   * channel kind reclassifies between `voice` and `voice-sfu` while a
   * call is already running — we want the topology to follow the new
   * kind without forcing every participant to leave/rejoin.
   *
   * Going `true → false` (voice-sfu → voice): tear down the SFU client,
   * fire `onTopologyChange(null)`, start mesh subscriptions.
   *
   * Going `false → true` (voice → voice-sfu): ask `pickSfu` for the
   * channel's current SFU; if found, tear down mesh + flip to SFU. If
   * no SFU is reachable, stay in mesh.
   */
  setExpectSfu(expect: boolean): void {
    if (this.expectSfu === expect) return;
    this.expectSfu = expect;
    if (!this.joined) return;
    if (!expect && this.sfuPubkey) {
      const sfuPubkey = this.sfuPubkey;
      this.exitSfuMode();
      try { this.events.onTopologyChange?.(null); } catch (err) {
        console.warn('[voice] onTopologyChange handler threw', err);
      }
      void this.enterMeshMode().catch((err) =>
        console.warn('[voice] enterMeshMode after SFU exit failed', err),
      );
      console.log('[voice] topology sfu:', sfuPubkey.slice(0, 8), '→ mesh');
    } else if (expect && !this.sfuPubkey) {
      void (async () => {
        const picked = await pickSfu(this.channelId).catch(() => null);
        if (!picked) return;
        this.exitMeshMode();
        await this.enterSfuMode(picked.pubkey);
      })();
    }
  }

  /**
   * Update the trusted member / admin lists at runtime. Existing peers from
   * pubkeys that just dropped out of the member set are torn down.
   */
  updateRoles(members: readonly string[], admins: readonly string[]): void {
    this.members = new Set(members);
    this.admins = new Set(admins);
    if (this.openRoom) return;
    for (const pk of Array.from(this.peers.keys())) {
      // Admins are full members for connectivity purposes — kind 39001
      // doesn't always duplicate into 39002, so checking only `members`
      // would tear down legitimate admin peers on every role update.
      if (!this.isMember(pk)) {
        this.tearDownPeer(pk);
      }
    }
  }

  /** True when the local user is allowed to publish a beacon. */
  canJoin(): boolean {
    return this.openRoom || this.members.has(this.selfPubkey) || this.admins.has(this.selfPubkey);
  }

  isMember(pubkey: string): boolean {
    // SFUs are pseudo-members: their signed beacon is the credential.
    // This avoids forcing operators to add every SFU they want to use
    // to every channel's NIP-29 member list. Filter is the same on the
    // signaling path so the SFU's offers/answers/ICE aren't dropped.
    if (this.knownSfuPubkeys.has(pubkey)) return true;
    return this.openRoom || this.members.has(pubkey) || this.admins.has(pubkey);
  }

  isAdmin(pubkey: string): boolean {
    return this.admins.has(pubkey);
  }

  async join(): Promise<void> {
    if (this.joined) return;
    if (!this.canJoin()) {
      throw new Error('You are not a member of this voice channel.');
    }
    this.joined = true;

    // The Join button is the user gesture that lets us resume the shared
    // AudioContext used by SpeakingDetector. Browsers create it suspended.
    void resumeSharedAudioContext();

    // Mic-on by default — voice channels are voice-first and acquiring the
    // mic eagerly tags the browser session as "communication", letting the
    // OS auto-duck background media.
    await this.setMicEnabled(true);

    // Topology decision is made up-front, not driven by the beacon roster
    // arriving late: for `voice-sfu` channels, ask `pickSfu` (per-channel
    // pin → env override → kind 31313 advertisement) and switch to SFU
    // mode immediately. The SFU itself becomes the source of truth for
    // the participant list via `peerJoined`/`peerLeft`/`participantList`
    // notifications, so we skip beacons + roster entirely while in SFU
    // mode. Falls back to mesh if no SFU is reachable.
    if (this.expectSfu) {
      const picked = await pickSfu(this.channelId).catch((err) => {
        console.warn('[voice] pickSfu threw at join', err);
        return null;
      });
      if (picked) {
        await this.enterSfuMode(picked.pubkey);
        return;
      }
    }

    await this.enterMeshMode();
  }

  /**
   * Subscribe to roster + signaling, publish the first beacon, and start
   * the periodic beacon timer. Idempotent — re-running is a no-op when
   * mesh subs are already up. Used both at fresh join and as the SFU
   * fallback when `pickSfu` returns null or `SfuClient.start` throws.
   */
  private async enterMeshMode(): Promise<void> {
    if (this.signalsUnsub || this.rosterUnsub) return;

    // Subscribe to incoming signaling first so we don't miss offers from
    // peers who learn about us via the beacon we're about to send.
    this.signalsUnsub = await subscribeSignals(
      this.channelId,
      this.selfPubkey,
      (from, payload) => {
        // Drop signals from non-members up-front. The relay can't enforce
        // this on its own, so the receiver is the gatekeeper.
        if (!this.isMember(from)) return;
        void this.routeSignal(from, payload);
      },
    );

    this.rosterUnsub = await subscribeRoster(this.channelId, (roster) => {
      // Snapshot the live roster so the video-slot computation can see
      // every other peer's `videoTracks` claim alongside our own state.
      this.currentRoster = roster;
      // Refresh known-SFU set BEFORE the membership filter so SFU
      // beacons survive `isMember` even when the SFU isn't in the
      // channel's NIP-29 member list. Auto-trust is intentional —
      // operators shouldn't have to babysit the member list every
      // time they want to spin up an SFU.
      this.knownSfuPubkeys = new Set(roster.filter((r) => r.isSfu).map((r) => r.pubkey));
      // Compute the transitive participant set first — including peers we
      // only know about from someone else's `connectedTo` p-tags — then
      // filter by membership and hand to handleRoster for cap+open logic.
      const allPubkeys = transitiveParticipants(roster);
      const filtered = allPubkeys.filter((pk) => this.isMember(pk));
      this.handleRoster(filtered);
      // Re-evaluate the video cap whenever the roster changes — a new
      // claim from a peer whose beacon arrived after ours could push us
      // outside the leading slice and require local eviction.
      this.enforceVideoSlotCap();
    });

    await this.publishBeacon();
    // Front-loaded burst — beacons are ephemeral so a peer whose relay
    // session was still completing NIP-42 AUTH on our first beacon needs
    // several more chances within the user's "is this stuck?" window
    // before we let the 15 s steady-state cadence take over.
    for (const delay of BEACON_BRINGUP_DELAYS_MS) {
      this.bringupTimers.push(
        setTimeout(() => { void this.publishBeacon().catch(() => {}); }, delay),
      );
    }
    this.beaconTimer = setInterval(() => {
      void this.publishBeacon().catch(() => {});
    }, BEACON_INTERVAL_MS);
  }

  /**
   * Tear down the mesh-mode subscriptions, timers, and any open `Peer`
   * instances. Safe to call when mesh isn't running. Used by the
   * mid-call mesh→SFU transition (`setExpectSfu(true)`).
   */
  private exitMeshMode(): void {
    if (this.beaconTimer) { clearInterval(this.beaconTimer); this.beaconTimer = null; }
    if (this.beaconRefreshTimer) { clearTimeout(this.beaconRefreshTimer); this.beaconRefreshTimer = null; }
    for (const t of this.bringupTimers) clearTimeout(t);
    this.bringupTimers.length = 0;
    this.signalsUnsub?.(); this.signalsUnsub = null;
    this.rosterUnsub?.(); this.rosterUnsub = null;
    this.currentRoster = [];
    this.seenRosterPubkeys.clear();
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
  }

  /**
   * Flip topology to SFU mode. Sets `sfuPubkey`, fires `onTopologyChange`,
   * and stands up the `SfuClient`. On `SfuClient.start()` failure, clears
   * SFU state and falls back to mesh — UI gets back-to-back
   * `onTopologyChange(sfu)` then `onTopologyChange(null)` so the badge
   * reflects the live state.
   */
  private async enterSfuMode(sfuPubkey: string): Promise<void> {
    if (this.sfuPubkey === sfuPubkey && this.sfuClient) return;

    if (this.sfuClient) {
      try { this.sfuClient.close(); } catch { /* ignore */ }
      this.sfuClient = null;
    }
    this.sfuPubkey = sfuPubkey;
    try { this.events.onTopologyChange?.(sfuPubkey); } catch (err) {
      console.warn('[voice] onTopologyChange handler threw', err);
    }
    await this.startSfuClient(sfuPubkey);
  }

  async leave(): Promise<void> {
    if (!this.joined) return;
    this.joined = false;
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
    if (this.beaconRefreshTimer) {
      clearTimeout(this.beaconRefreshTimer);
      this.beaconRefreshTimer = null;
    }
    for (const t of this.bringupTimers) clearTimeout(t);
    this.bringupTimers.length = 0;
    this.seenRosterPubkeys.clear();
    this.signalsUnsub?.();
    this.signalsUnsub = null;
    this.rosterUnsub?.();
    this.rosterUnsub = null;

    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    if (this.sfuClient) {
      try { this.sfuClient.close(); } catch { /* ignore */ }
      this.sfuClient = null;
    }
    this.sfuPubkey = null;
    this.rosterPubkeys = [];
    this.connectedPubkeys.clear();
    this.localVideoClaimedAt.clear();
    this.currentRoster = [];
    this.remoteTracks.clear();
    this.events.onRemoteTracksChange?.([]);

    // Stop every speaking detector and clear the store entry so orbs go dark.
    for (const [pk, det] of this.speakingDetectors) {
      det.stop();
      try { useVoiceStore.getState().setSpeaking(pk, false); } catch { /* no store yet during tests */ }
    }
    this.speakingDetectors.clear();
    try { useVoiceStore.getState().clearLocalMutes(); } catch { /* test envs */ }

    this.stopTrack(this.micTrack); this.micTrack = null;
    this.stopTrack(this.camTrack); this.camTrack = null;
    this.stopTrack(this.screenTrack); this.screenTrack = null;
    this.stopTrack(this.screenAudioTrack); this.screenAudioTrack = null;
    this.emitLocal();
    this.events.onLeft?.();
  }

  // ── Beacon publishing ──────────────────────────────────────────────────

  /**
   * Publish a presence beacon advertising our currently-connected peers
   * AND the outbound video tracks we're sending. The connected list powers
   * transitive discovery on other clients; the video list lets every peer
   * compute the room-wide video count for `MAX_VIDEO_SLOTS` enforcement.
   *
   * Public so multi-client integration tests can drive each node's beacon
   * deterministically (the production cadence is timer-driven via
   * `BEACON_INTERVAL_MS` + opportunistic refresh on connection-state change
   * or local video toggle).
   */
  async publishBeacon(): Promise<void> {
    const videoTracks: VideoSlotKind[] = [];
    if (this.camTrack) videoTracks.push('camera');
    if (this.screenTrack) videoTracks.push('screen');
    await publishPresenceBeacon(this.channelId, [...this.connectedPubkeys], videoTracks);
  }

  /**
   * Schedule a beacon refresh after a short debounce. Called when our
   * connected-peer set changes so the propagation latency for transitive
   * discovery is one debounce window, not one full BEACON_INTERVAL_MS.
   */
  private scheduleBeaconRefresh(): void {
    if (!this.joined) return;
    if (this.beaconRefreshTimer) return;
    this.beaconRefreshTimer = setTimeout(() => {
      this.beaconRefreshTimer = null;
      if (!this.joined) return;
      void this.publishBeacon().catch(() => {});
    }, BEACON_REFRESH_DEBOUNCE_MS);
  }

  // ── Roster + peer management ───────────────────────────────────────────

  /**
   * Mesh-only roster handler. The SFU path bypasses this entirely — it
   * mirrors the SFU's pushed `participantList`/`peerJoined`/`peerLeft`
   * directly into `rosterPubkeys` from the `SfuClient.onPeersChange`
   * callback. Roster subscription is gated by `enterMeshMode`, so this
   * function can assume mesh mode.
   */
  private handleRoster(pubkeys: string[]) {
    const others = pubkeys.filter((p) => p !== this.selfPubkey);

    // First-sighting rebroadcast: if any pubkey in this snapshot is new to
    // us, schedule a beacon refresh so that peer learns about us within
    // ~250 ms instead of waiting up to a full BEACON_INTERVAL_MS for our
    // next periodic publish. The debounce coalesces a flurry of new peers
    // (e.g. cold-start where the first roster delivery contains the entire
    // room) into a single extra publish.
    let sawNew = false;
    for (const pk of others) {
      if (!this.seenRosterPubkeys.has(pk)) {
        this.seenRosterPubkeys.add(pk);
        sawNew = true;
      }
    }
    if (sawNew) this.scheduleBeaconRefresh();

    // Hard cap: if more than MAX_PARTICIPANTS would be present and we're
    // not in the leading slice, deterministically (lex) trim the tail so
    // every client agrees on the same set of cap-violators.
    const visible = others.slice();
    if (visible.length + 1 > MAX_PARTICIPANTS) {
      visible.sort();
      visible.splice(MAX_PARTICIPANTS - 1);
    }

    // Union of roster pubkeys + already-open peers. Some peers are
    // discovered via incoming signaling when relays don't deliver beacons
    // symmetrically — keeping them in the UI list prevents them from
    // disappearing mid-call.
    const union = new Set(visible);
    for (const pk of this.peers.keys()) union.add(pk);
    this.rosterPubkeys = Array.from(union);
    this.events.onParticipantsChange?.([...this.rosterPubkeys]);

    for (const p of visible) {
      if (!this.peers.has(p)) this.openPeer(p);
    }
    // Cap-overflow eviction.
    if (this.peers.size + 1 > MAX_PARTICIPANTS) {
      const keep = new Set(Array.from(this.peers.keys()).sort().slice(0, MAX_PARTICIPANTS - 1));
      for (const pk of Array.from(this.peers.keys())) {
        if (!keep.has(pk)) this.tearDownPeer(pk);
      }
    }
  }

  /**
   * Tear down the active SFU client and drop SFU-attributed state. Used
   * by the SFU→mesh transition (`setExpectSfu(false)` mid-call, or fallback
   * after a failed `SfuClient.start`). Does NOT start mesh subscriptions
   * — caller decides whether to re-enter mesh.
   */
  private exitSfuMode(): void {
    const from = this.sfuPubkey;
    if (this.sfuClient) {
      try { this.sfuClient.close(); } catch { /* ignore */ }
      this.sfuClient = null;
    }
    if (from) {
      // Drop SFU-attributed remote tracks so the next topology re-emits
      // fresh ones rather than orphaning them on a closed peer.
      for (const [trackId, t] of Array.from(this.remoteTracks.entries())) {
        if (t.viaPubkey === from) this.remoteTracks.delete(trackId);
      }
      this.emitRemoteTracks();
      this.connectedPubkeys.delete(from);
    }
    this.sfuPubkey = null;
    this.rosterPubkeys = [];
    this.events.onParticipantsChange?.([]);
  }

  /**
   * Stand up the mediasoup-client driver: open RPC, load Device, build
   * send/recv transports, then push every local track. On `start()`
   * failure, fall back to mesh — clearing SFU state, firing
   * `onTopologyChange(null)`, and entering mesh subscriptions.
   *
   * Caller (`enterSfuMode`) guarantees the previous client was torn down.
   */
  private async startSfuClient(sfuPubkey: string): Promise<void> {
    // SFU's listening relays may be a strict subset of the dex's bridge
    // default relays (relay.obelisk.ar only, not public.obelisk.ar). Pass
    // them through so kind 25050 RPC envelopes land where the SFU is
    // actually subscribed.
    //
    // Resolution order matches `pickSfu(channelId)`:
    //   1. per-channel pin (kind 30078)        — preferred
    //   2. NEXT_PUBLIC_SFU_TRUSTED_RELAYS env  — fallback for unconfigured channels
    const picked = await pickSfu(this.channelId);
    let trustedRelays: string[] = [];
    if (picked && picked.pubkey === sfuPubkey && picked.trustedRelays.length > 0) {
      trustedRelays = [...picked.trustedRelays];
    } else {
      trustedRelays = (process.env.NEXT_PUBLIC_SFU_TRUSTED_RELAYS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const client = new SfuClient({
      channelId: this.channelId,
      sfuPubkey,
      selfPubkey: this.selfPubkey,
      ...(trustedRelays.length > 0 ? { trustedRelays } : {}),
      events: {
        onRemoteTrack: (t: SfuRemoteTrack) => {
          if (this.deafened && (t.kind === 'audio' || t.kind === 'screen-audio')) {
            t.consumer.track.enabled = false;
          }
          const logicalPubkey = t.pubkey || sfuPubkey;
          this.remoteTracks.set(t.trackId, {
            pubkey: logicalPubkey,
            viaPubkey: sfuPubkey,
            trackId: t.trackId,
            kind: t.kind,
            stream: t.stream,
          });
          if (t.kind === 'audio') {
            this.attachSpeakingDetector(logicalPubkey, t.stream);
          }
          this.emitRemoteTracks();
        },
        onRemoteTrackEnded: (trackId) => {
          const removed = this.remoteTracks.get(trackId);
          this.remoteTracks.delete(trackId);
          if (removed?.kind === 'audio') {
            this.detachSpeakingDetector(removed.pubkey);
          }
          this.emitRemoteTracks();
        },
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            this.connectedPubkeys.add(sfuPubkey);
          } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            this.connectedPubkeys.delete(sfuPubkey);
          }
        },
        onPeersChange: (pubkeys) => {
          // SFU is the source of truth for the participant list in SFU
          // mode. Mirror it directly into the renderable roster — no
          // beacon discovery, no transitive merging.
          this.rosterPubkeys = [...pubkeys];
          try {
            this.events.onParticipantsChange?.([...pubkeys]);
          } catch (err) {
            console.warn('[voice] onParticipantsChange handler threw', err);
          }
        },
      },
    });
    this.sfuClient = client;
    try {
      await client.start();
    } catch (err) {
      console.warn('[voice] SfuClient.start failed, falling back to mesh', err);
      try { client.close(); } catch { /* ignore */ }
      if (this.sfuClient === client) this.sfuClient = null;
      // Surface the failure and switch to mesh so users still get a working
      // call instead of an empty SFU room.
      try { this.events.onError?.('SFU connection failed; using mesh.'); } catch { /* ignore */ }
      if (this.sfuPubkey === sfuPubkey) {
        this.sfuPubkey = null;
        try { this.events.onTopologyChange?.(null); } catch { /* ignore */ }
        await this.enterMeshMode();
      }
      return;
    }
    // Push existing local tracks to the new client.
    if (this.micTrack) await client.publishTrack('audio', this.micTrack).catch((e) => console.warn('[voice] publish mic threw', e));
    if (this.camTrack) await client.publishTrack('camera', this.camTrack).catch((e) => console.warn('[voice] publish cam threw', e));
    if (this.screenTrack) await client.publishTrack('screen', this.screenTrack).catch((e) => console.warn('[voice] publish screen threw', e));
    if (this.screenAudioTrack) await client.publishTrack('screen-audio', this.screenAudioTrack).catch((e) => console.warn('[voice] publish screen-audio threw', e));
  }

  private openPeer(remotePubkey: string) {
    // Defensive: after leave() the client should never spin up new peers.
    // Late-arriving rosters can otherwise trigger openPeer post-teardown
    // and the resulting RTCPeerConnection would never be cleaned up.
    if (!this.joined) return;
    // SFU peer is handled by `SfuClient`/mediasoup-client, not by the mesh
    // perfect-negotiation path. Don't construct a `Peer` for it.
    if (this.sfuPubkey && remotePubkey === this.sfuPubkey) return;
    // Lexicographically-greater pubkey is polite (rolls back on glare).
    // EXCEPTION — peers that are an SFU are ALWAYS treated as remote-impolite
    // (so we are polite). werift's SFU implementation cannot roll back its
    // own offer; if pubkey ordering happened to put the SFU on the polite
    // side, every renegotiation deadlocks with both sides dropping the
    // other's offer. Forcing the browser to be polite for SFU peers keeps
    // the perfect-negotiation invariants while accommodating werift.
    const isSfuPeer = this.knownSfuPubkeys.has(remotePubkey);
    const polite = isSfuPeer ? true : this.selfPubkey > remotePubkey;
    console.log('[voice] openPeer', remotePubkey.slice(0, 8),
      'polite=', polite, isSfuPeer ? '(sfu)' : '');
    const peer = new Peer({
      remotePubkey,
      polite,
      sessionId: this.sessionId,
      send: (payload) => sendSignal(this.channelId, remotePubkey, payload),
      events: {
        onRemoteTrack: (track, stream, kind, originPubkey) => {
          // Apply current deafen state to brand-new audio arrivals so a peer
          // who joins after we deafened doesn't suddenly become audible.
          if (this.deafened && (kind === 'audio' || kind === 'screen-audio')) {
            track.enabled = false;
          }
          // In SFU mode `originPubkey` differs from `remotePubkey` (the SFU
          // is the RTC peer; the participant who actually produced the
          // media is the origin). Tile mapping uses the origin so the
          // sound shows up on the right person's tile, not the SFU's.
          const logicalPubkey = originPubkey ?? remotePubkey;
          this.remoteTracks.set(track.id, {
            pubkey: logicalPubkey,
            viaPubkey: remotePubkey,
            trackId: track.id,
            kind,
            stream,
          });
          // Speaking detection keyed by origin so SFU mode lights up the
          // correct tile, not "the SFU is speaking" for everyone.
          if (kind === 'audio') {
            this.attachSpeakingDetector(logicalPubkey, stream);
          }
          this.emitRemoteTracks();
        },
        onRemoteTrackEnded: (trackId) => {
          const removed = this.remoteTracks.get(trackId);
          this.remoteTracks.delete(trackId);
          // If the ended track was the peer's mic, stop their detector so
          // the orb doesn't strobe on stale RMS readings post-disconnect.
          // Use the track's logical (origin) pubkey, not the RTC remote.
          if (removed?.kind === 'audio') {
            this.detachSpeakingDetector(removed.pubkey);
          }
          this.emitRemoteTracks();
        },
        onConnectionEstablished: () => {
          this.connectedPubkeys.add(remotePubkey);
          this.scheduleBeaconRefresh();
        },
        onConnectionLost: () => {
          if (this.connectedPubkeys.delete(remotePubkey)) {
            this.scheduleBeaconRefresh();
          }
        },
        onQualitySample: (sample) => {
          try { useVoiceStore.getState().setPeerQuality(remotePubkey, sample); } catch { /* test envs */ }
        },
        onConnectionStateChange: (state) => {
          if (state === 'closed') {
            // Drop the peer so a future signal/beacon from the same pubkey
            // can spawn a fresh PC instead of routing into a dead one. The
            // Peer's reconnect ladder handles 'failed'/'disconnected'
            // internally — only react to 'closed' here, which means the
            // ladder has explicitly given up or close() was called.
            const p = this.peers.get(remotePubkey);
            if (p && p === peer) {
              this.tearDownPeer(remotePubkey);
              this.events.onParticipantsChange?.([...this.rosterPubkeys.filter((pk) => pk !== remotePubkey)]);
            }
          }
        },
      },
    });

    // Push existing local tracks to the new peer.
    void this.attachAllLocalTracks(peer).then(() => {
      // For SFU peers we MUST initiate the offer ourselves — werift's SFU
      // never sends the first offer, it only answers. If the user joined
      // with no mic/cam, attachAllLocalTracks adds zero tracks and no
      // negotiation kicks; both sides then deadlock waiting. kickInitialOffer
      // is a no-op when senders already exist (setLocalTrack already kicked),
      // and otherwise adds recvonly transceivers so the offer has m-sections.
      if (isSfuPeer) {
        void peer.kickInitialOffer();
      }
    });

    this.peers.set(remotePubkey, peer);
  }

  /**
   * Tear down a peer connection and clean up every state map that referred
   * to it — speaking detector, remote tracks, connected set, store entry.
   * Single source of truth so we don't leak state on partial cleanup paths.
   *
   * Order matters: we delete from `this.peers` BEFORE calling `peer.close()`
   * because `pc.close()` fires `onconnectionstatechange('closed')`
   * synchronously, and the listener checks `this.peers.get(pubkey) === peer`
   * to decide whether to clean up. With the entry still in the map at that
   * moment, the listener would re-enter `tearDownPeer` and recurse.
   */
  private tearDownPeer(pubkey: string): void {
    const peer = this.peers.get(pubkey);
    if (peer) {
      this.peers.delete(pubkey);
      peer.close();
    }
    this.removeRemoteTracksFor(pubkey);
    this.detachSpeakingDetector(pubkey);
    if (this.connectedPubkeys.delete(pubkey)) {
      this.scheduleBeaconRefresh();
    }
    try { useVoiceStore.getState().clearPeerQuality(pubkey); } catch { /* test envs */ }
  }

  private async attachAllLocalTracks(peer: Peer) {
    if (this.micTrack) await peer.setLocalTrack('audio', this.micTrack);
    if (this.camTrack) await peer.setLocalTrack('camera', this.camTrack);
    if (this.screenTrack) await peer.setLocalTrack('screen', this.screenTrack);
    if (this.screenAudioTrack) await peer.setLocalTrack('screen-audio', this.screenAudioTrack);
    // Push the user-chosen outbound cap and our receive hint so a peer who
    // joins mid-call inherits the same quality contract as existing peers.
    let videoQuality: VideoQuality = 'auto';
    let receivedVideoQuality: VideoQuality = 'auto';
    try {
      const s = useVoiceStore.getState();
      videoQuality = s.videoQuality;
      receivedVideoQuality = s.receivedVideoQuality;
    } catch { /* test envs */ }
    const localPreset = getPreset(videoQuality);
    await peer.setLocalVideoCap({ maxBitrate: localPreset.maxBitrate, maxFramerate: localPreset.maxFramerate });
    if (receivedVideoQuality !== 'auto') {
      const inbound = getPreset(receivedVideoQuality);
      await peer.sendQualityHint(qualityHintFromPreset(inbound));
    }
  }

  /** User changed their outbound camera quality. Re-acquire the track at the
   *  new resolution and update encoder caps on every peer. */
  async applyVideoQuality(q: VideoQuality): Promise<void> {
    const preset = getPreset(q);
    const cap = { maxBitrate: preset.maxBitrate, maxFramerate: preset.maxFramerate };
    if (this.camTrack) {
      try {
        await this.camTrack.applyConstraints(preset.constraints);
      } catch (e) {
        console.warn('[voice] applyConstraints failed, will re-acquire', e);
      }
    }
    for (const peer of this.peers.values()) {
      await peer.setLocalVideoCap(cap);
    }
  }

  /** User changed their incoming-quality preference. Broadcast a qualityhint
   *  to every peer so they cap their outbound video to us. */
  async broadcastReceivedQuality(q: VideoQuality): Promise<void> {
    const preset = getPreset(q);
    const hint = qualityHintFromPreset(preset);
    for (const peer of this.peers.values()) {
      await peer.sendQualityHint(hint);
    }
  }

  private removeRemoteTracksFor(pubkey: string) {
    let changed = false;
    const droppedAudioOrigins = new Set<string>();
    // Match by `viaPubkey` (RTC remote) — when the SFU's PC drops, every
    // forwarded track must clear regardless of which origin it carried.
    // In mesh, viaPubkey === pubkey so the behavior is unchanged.
    for (const [id, t] of Array.from(this.remoteTracks.entries())) {
      if (t.viaPubkey === pubkey) {
        this.remoteTracks.delete(id);
        if (t.kind === 'audio') droppedAudioOrigins.add(t.pubkey);
        changed = true;
      }
    }
    // Stop speaking detectors for every origin whose audio just disappeared,
    // so the speaking orb on each affected tile clears immediately.
    for (const origin of droppedAudioOrigins) {
      this.detachSpeakingDetector(origin);
    }
    if (changed) this.emitRemoteTracks();
  }

  private async routeSignal(fromPubkey: string, payload: VoiceSignalPayload): Promise<void> {
    // SFU traffic flows through `SfuClient` (mediasoup-client + RPC), not
    // the mesh perfect-negotiation `Peer`. The legacy subscribeSignals
    // delivers everything on kind 25050 — including RPC responses /
    // notifications that have no `type` we recognize — so we drop those
    // here. Without this guard `peer.handleSignal(undefined!.handleSignal)`
    // throws TypeError on every RPC reply from the SFU.
    if (this.sfuPubkey && fromPubkey === this.sfuPubkey) return;
    // Defensively ignore unknown payload shapes (e.g. RPC envelopes from
    // a different peer that mistakenly addressed us).
    if (!payload || typeof payload.type !== 'string') return;
    if (payload.type !== 'offer' && payload.type !== 'answer'
      && payload.type !== 'ice' && payload.type !== 'bye'
      && payload.type !== 'trackinfo' && payload.type !== 'qualityhint'
      && payload.type !== 'requestReset') {
      return;
    }
    let peer = this.peers.get(fromPubkey);
    if (!peer) {
      // Roster may not have caught up yet; create the peer eagerly so the
      // initial offer doesn't get dropped on join.
      this.openPeer(fromPubkey);
      peer = this.peers.get(fromPubkey);
      if (!peer) return; // openPeer skipped (e.g. !this.joined)
    }
    await peer.handleSignal(payload);
  }

  // ── Speaking detection ─────────────────────────────────────────────────

  private attachSpeakingDetector(pubkey: string, stream: MediaStream): void {
    this.detachSpeakingDetector(pubkey);
    let detector: SpeakingDetector;
    try {
      detector = new SpeakingDetector(stream, (speaking) => {
        try { useVoiceStore.getState().setSpeaking(pubkey, speaking); } catch { /* test envs */ }
      });
    } catch (e) {
      // jsdom and a handful of older Safari builds don't expose AudioContext.
      // The call is voice-first, so we silently degrade (no speaking orb)
      // rather than tearing down the call.
      console.warn('[voice] speaking detector unavailable:', e);
      return;
    }
    this.speakingDetectors.set(pubkey, detector);
    detector.start();
  }

  private detachSpeakingDetector(pubkey: string): void {
    const det = this.speakingDetectors.get(pubkey);
    if (!det) return;
    det.stop();
    this.speakingDetectors.delete(pubkey);
    try { useVoiceStore.getState().setSpeaking(pubkey, false); } catch { /* test envs */ }
  }

  // ── Local-media controls ───────────────────────────────────────────────

  async setMicEnabled(on: boolean): Promise<void> {
    if (on && !this.micTrack) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: MIC_CONSTRAINTS,
      });
      this.micTrack = stream.getAudioTracks()[0] ?? null;
      if (this.micTrack) {
        // Local speaking detector — drives the viewer's own orb without a
        // round-trip through remote peers. Detector reads via AnalyserNode
        // only (never connects to destination), so playback stays purely
        // on the outbound sender.
        this.attachSpeakingDetector(this.selfPubkey, new MediaStream([this.micTrack]));
        for (const peer of this.peers.values()) await peer.setLocalTrack('audio', this.micTrack);
        if (this.sfuClient) await this.sfuClient.publishTrack('audio', this.micTrack).catch((e) => console.warn('[voice] sfu publish mic threw', e));
      }
    } else if (!on && this.micTrack) {
      // Stop the local detector so the orb goes dark immediately.
      this.detachSpeakingDetector(this.selfPubkey);
      for (const peer of this.peers.values()) await peer.setLocalTrack('audio', null);
      if (this.sfuClient) await this.sfuClient.unpublishTrack('audio').catch(() => undefined);
      this.stopTrack(this.micTrack);
      this.micTrack = null;
    }
    this.emitLocal();
  }

  async setCameraEnabled(on: boolean): Promise<void> {
    console.log('[voice] setCameraEnabled', on, 'peers=', this.peers.size);
    if (on && !this.camTrack) {
      // Room-wide video-slot cap: refuse early if every slot is already
      // claimed. Race-overflow (two peers claim simultaneously) is
      // resolved by `enforceVideoSlotCap` once beacons round-trip.
      if (!this.canClaimVideoSlot('camera')) {
        const err = new Error(`Video room is full (${MAX_VIDEO_SLOTS}/${MAX_VIDEO_SLOTS} slots in use). Ask someone to turn off their camera/screen.`);
        try { useVoiceStore.getState().setError(err.message); } catch { /* test envs */ }
        throw err;
      }
      let quality: VideoQuality = 'auto';
      try { quality = useVoiceStore.getState().videoQuality; } catch { /* test envs */ }
      const preset = getPreset(quality);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: preset.constraints,
      });
      this.camTrack = stream.getVideoTracks()[0] ?? null;
      console.log('[voice] camera acquired, track=', this.camTrack?.id, 'quality=', quality);
      if (this.camTrack) {
        // Bias the encoder toward smooth motion (faces, gestures) over
        // peak per-frame resolution. Browsers honor this when picking
        // between motion-vector vs intra-frame compression strategies.
        try { (this.camTrack as MediaStreamTrack).contentHint = 'motion'; } catch { /* older browsers */ }
        // Claim the slot immediately so a flurry of remote beacons doesn't
        // bounce us out before our own beacon publishes.
        this.localVideoClaimedAt.set('camera', Math.floor(Date.now() / 1000));
        const cap = { maxBitrate: preset.maxBitrate, maxFramerate: preset.maxFramerate };
        for (const peer of this.peers.values()) {
          await peer.setLocalTrack('camera', this.camTrack);
          await peer.setLocalVideoCap(cap);
        }
        if (this.sfuClient) await this.sfuClient.publishTrack('camera', this.camTrack).catch((e) => console.warn('[voice] sfu publish camera threw', e));
        // Republish beacon ASAP so other peers see our claim and don't
        // race past us.
        this.scheduleBeaconRefresh();
      }
    } else if (!on && this.camTrack) {
      for (const peer of this.peers.values()) await peer.setLocalTrack('camera', null);
      if (this.sfuClient) await this.sfuClient.unpublishTrack('camera').catch(() => undefined);
      this.stopTrack(this.camTrack);
      this.camTrack = null;
      if (this.localVideoClaimedAt.delete('camera')) {
        this.scheduleBeaconRefresh();
      }
    }
    this.emitLocal();
  }

  async setScreenShareEnabled(on: boolean): Promise<void> {
    if (on && !this.screenTrack) {
      // Same room-wide video-slot cap as camera; screen-share counts as
      // one slot regardless of whether screen-audio is attached.
      if (!this.canClaimVideoSlot('screen')) {
        const err = new Error(`Video room is full (${MAX_VIDEO_SLOTS}/${MAX_VIDEO_SLOTS} slots in use). Ask someone to turn off their camera/screen.`);
        try { useVoiceStore.getState().setError(err.message); } catch { /* test envs */ }
        throw err;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true,
      });
      this.screenTrack = stream.getVideoTracks()[0] ?? null;
      this.screenAudioTrack = stream.getAudioTracks()[0] ?? null;
      if (this.screenTrack) {
        // Screen-share is text-heavy: tell the encoder to preserve detail
        // (sharp glyphs) rather than smoothness. Pairs with the
        // 'maintain-resolution' degradationPreference set in peer.ts.
        try { (this.screenTrack as MediaStreamTrack).contentHint = 'detail'; } catch { /* older browsers */ }
        this.localVideoClaimedAt.set('screen', Math.floor(Date.now() / 1000));
        for (const peer of this.peers.values()) await peer.setLocalTrack('screen', this.screenTrack);
        if (this.sfuClient) await this.sfuClient.publishTrack('screen', this.screenTrack).catch((e) => console.warn('[voice] sfu publish screen threw', e));
      }
      if (this.screenAudioTrack) {
        // Music / system audio — let Opus encode at full quality, no AGC.
        try { (this.screenAudioTrack as MediaStreamTrack).contentHint = 'music'; } catch { /* older browsers */ }
        for (const peer of this.peers.values()) await peer.setLocalTrack('screen-audio', this.screenAudioTrack);
        if (this.sfuClient) await this.sfuClient.publishTrack('screen-audio', this.screenAudioTrack).catch((e) => console.warn('[voice] sfu publish screen-audio threw', e));
      }
      // Browser-driven stop ("Stop sharing" toolbar button) — clean up.
      if (this.screenTrack) {
        this.screenTrack.onended = () => { void this.setScreenShareEnabled(false); };
      }
      this.scheduleBeaconRefresh();
    } else if (!on) {
      if (this.screenTrack) {
        for (const peer of this.peers.values()) await peer.setLocalTrack('screen', null);
        if (this.sfuClient) await this.sfuClient.unpublishTrack('screen').catch(() => undefined);
        this.stopTrack(this.screenTrack);
        this.screenTrack = null;
      }
      if (this.screenAudioTrack) {
        for (const peer of this.peers.values()) await peer.setLocalTrack('screen-audio', null);
        if (this.sfuClient) await this.sfuClient.unpublishTrack('screen-audio').catch(() => undefined);
        this.stopTrack(this.screenAudioTrack);
        this.screenAudioTrack = null;
      }
      if (this.localVideoClaimedAt.delete('screen')) {
        this.scheduleBeaconRefresh();
      }
    }
    this.emitLocal();
  }

  getLocalTracks(): { mic: MediaStreamTrack | null; camera: MediaStreamTrack | null; screen: MediaStreamTrack | null } {
    return { mic: this.micTrack, camera: this.camTrack, screen: this.screenTrack };
  }

  /**
   * Silence all incoming audio. Doesn't affect what we publish — peers still
   * hear us if our mic is on. Implemented by disabling the receive side of
   * each remote audio track; new arrivals inherit the flag in `onRemoteTrack`.
   */
  setDeafenEnabled(on: boolean): void {
    this.deafened = on;
    for (const t of this.remoteTracks.values()) {
      if (t.kind === 'audio' || t.kind === 'screen-audio') {
        for (const track of t.stream.getAudioTracks()) track.enabled = !on;
      }
    }
  }

  isDeafened(): boolean {
    return this.deafened;
  }

  // ── Video-slot cap (room-wide) ─────────────────────────────────────────

  /**
   * Build the flattened list of every video track currently in the room
   * — local + remote — sorted by `(claimedAt asc, pubkey asc)` so any two
   * clients computing this list independently agree on the leading slice.
   *
   * For remote tracks, `claimedAt` is the publisher's beacon `createdAt`.
   * For local tracks, `claimedAt` is the wall-clock second we acquired
   * the track. They share the same units (relay seconds), so the order
   * is consistent across publishers.
   */
  private buildVideoSlotList(): { pubkey: string; kind: VideoSlotKind; claimedAt: number }[] {
    const list: { pubkey: string; kind: VideoSlotKind; claimedAt: number }[] = [];
    // Remote claims from beacons (excluding self — we use our own track
    // state, not the beacon we published, to avoid a stale beacon claim
    // outliving a track we just stopped).
    for (const presence of this.currentRoster) {
      if (presence.pubkey === this.selfPubkey) continue;
      for (const kind of presence.videoTracks) {
        list.push({ pubkey: presence.pubkey, kind, claimedAt: presence.createdAt });
      }
    }
    // Local claims.
    for (const [kind, claimedAt] of this.localVideoClaimedAt.entries()) {
      list.push({ pubkey: this.selfPubkey, kind, claimedAt });
    }
    list.sort((a, b) => {
      if (a.claimedAt !== b.claimedAt) return a.claimedAt - b.claimedAt;
      if (a.pubkey !== b.pubkey) return a.pubkey < b.pubkey ? -1 : 1;
      // Same publisher claiming both kinds: 'camera' before 'screen' is
      // arbitrary but deterministic.
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      return 0;
    });
    return list;
  }

  /**
   * Number of video slots currently in use across the room.
   * UI exposes this so the camera/screen buttons can disable when full.
   */
  getVideoSlotsInUse(): number {
    return Math.min(this.buildVideoSlotList().length, MAX_VIDEO_SLOTS);
  }

  getVideoSlotsAvailable(): number {
    return Math.max(0, MAX_VIDEO_SLOTS - this.buildVideoSlotList().length);
  }

  /**
   * Decide whether starting a new local video track would fit the cap.
   * Counts the existing room-wide load (excluding the kind being started
   * — caller is the one trying to claim it). Returns true iff the new
   * track would be inside the leading-MAX_VIDEO_SLOTS slice once claimed.
   */
  private canClaimVideoSlot(_kind: VideoSlotKind): boolean {
    return this.buildVideoSlotList().length < MAX_VIDEO_SLOTS;
  }

  /**
   * Re-check the cap against the latest roster. If our local video is
   * outside the leading-MAX_VIDEO_SLOTS slice, evict it (mirrors the
   * audio-mesh cap-overflow logic in `handleRoster`). Triggered on every
   * roster update, so a remote claim that landed before ours pushes us
   * out within one beacon hop.
   */
  private enforceVideoSlotCap(): void {
    if (this.localVideoClaimedAt.size === 0) return;
    const list = this.buildVideoSlotList();
    if (list.length <= MAX_VIDEO_SLOTS) return;
    const winners = list.slice(0, MAX_VIDEO_SLOTS);
    const winnerSet = new Set(winners.map((w) => `${w.pubkey}:${w.kind}`));
    // For each of OUR local tracks, evict the ones that didn't make it
    // into the leading slice. Don't await — the toggle is fire-and-forget;
    // any lingering peers will see the next beacon refresh announcing the
    // dropped track.
    for (const kind of Array.from(this.localVideoClaimedAt.keys())) {
      const ourKey = `${this.selfPubkey}:${kind}`;
      if (winnerSet.has(ourKey)) continue;
      console.warn('[voice] video-slot evicted locally:', kind, '— another peer claimed it earlier');
      if (kind === 'camera') {
        void this.setCameraEnabled(false);
      } else {
        void this.setScreenShareEnabled(false);
      }
      try { useVoiceStore.getState().setError(`Video room is full — your ${kind} was disabled.`); } catch { /* test envs */ }
    }
  }

  /**
   * Toggle local-only mute for a single peer. Shorthand around the voice
   * store entry — VoiceRoom binds `<audio>.muted` to the same flag, so the
   * UI applies it automatically. No Nostr traffic; purely local.
   */
  setPeerMuted(pubkey: string, muted: boolean): void {
    try {
      const s = useVoiceStore.getState();
      if (muted) s.muteLocally(pubkey);
      else s.unmuteLocally(pubkey);
    } catch { /* test envs */ }
  }

  /** Test/debug helper — exposes the connected-peer set used to populate
   *  the next beacon's `connectedTo` p-tags. */
  getConnectedPubkeys(): string[] {
    return Array.from(this.connectedPubkeys);
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private emitRemoteTracks() {
    this.events.onRemoteTracksChange?.(Array.from(this.remoteTracks.values()));
  }

  private emitLocal() {
    this.events.onLocalTracksChange?.({
      mic: !!this.micTrack,
      camera: !!this.camTrack,
      screen: !!this.screenTrack,
    });
  }

  private stopTrack(t: MediaStreamTrack | null) {
    if (!t) return;
    try { t.stop(); } catch { /* ignore */ }
  }
}

function qualityHintFromPreset(preset: { maxBitrate: number | null; maxFramerate: number; maxHeight: number | null }): VoiceQualityHint {
  return {
    maxHeight: preset.maxHeight,
    maxFramerate: preset.maxFramerate,
    maxBitrate: preset.maxBitrate,
  };
}

function randomId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
