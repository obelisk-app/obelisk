/**
 * The part of `VoiceClient`'s public surface that only reads the room or
 * hands a request to the collaborator that owns it: roster and track
 * snapshots, membership and topology updates, and the local-media, deafen
 * and per-peer mute controls. `VoiceClient` extends this and keeps the
 * join/leave lifecycle, which is where ordering matters.
 */
import type { MeshSession } from './mesh-session';
import type { SfuSession } from './sfu-session';
import type { VideoQuality } from './quality';
import type { LocalMedia } from './local-media';
import type { VoiceUiSink } from './ui-sink';
import type { RoomState, RemoteTrack } from './room-state';
import type { RoomMembership } from './membership';
import type { TopologySwitch } from './topology-switch';

export abstract class VoiceClientSurface {
  protected abstract readonly ui: VoiceUiSink;
  protected abstract readonly membership: RoomMembership;
  protected abstract readonly topology: TopologySwitch;
  protected abstract readonly room: RoomState;
  protected abstract readonly mesh: MeshSession;
  protected abstract readonly sfu: SfuSession;
  protected abstract readonly localMedia: LocalMedia;

  /**
   * Multicast subscribers for remote-track changes, beside the single
   * `events.onRemoteTracksChange` the React room component owns. Surfaces
   * outside the room (the always-mounted `BackgroundVoiceAudio` sink)
   * register here so they do not fight the room for `events`.
   */
  subscribeRemoteTracks(cb: (t: RemoteTrack[]) => void): () => void {
    return this.room.subscribeRemoteTracks(cb);
  }

  /** Snapshot helpers so a freshly-bound owner can hydrate UI state without
   *  waiting for the next event tick. */
  getParticipants(): string[] {
    return [...this.room.rosterPubkeys];
  }
  getRemoteTracks(): RemoteTrack[] {
    return this.room.getRemoteTracks();
  }
  /**
   * Test/diagnostic accessor - returns the underlying RTCPeerConnection's
   * `connectionState` for a remote pubkey, or `null` when there is no live
   * mesh peer for that pubkey (peer not opened yet, already torn down, or
   * SFU mode where the peer is the SFU). The Playwright two-peer mesh
   * spec calls this through `active-client.ts:getPeerConnectionState`.
   */
  getPeerConnectionState(pubkey: string): RTCPeerConnectionState | null {
    const peer = this.room.peers.get(pubkey);
    return peer?.pc?.connectionState ?? null;
  }
  getPeerConnectionStates(): Record<string, RTCPeerConnectionState> {
    return this.room.getPeerConnectionStates();
  }
  /**
   * Currently-active SFU pubkey for this channel, or null in mesh mode.
   * UI uses this to render an "SFU mode" badge or hide the participant
   * count from including the SFU. Follows `sfu.enter` / `sfu.exit`, not
   * the beacon roster.
   */
  getSfuPubkey(): string | null {
    return this.sfu.pubkey;
  }

  /**
   * Toggle the open-room flag at runtime, when the channel's kind 39000
   * metadata arrives (or is republished) after the client was constructed.
   */
  setOpen(open: boolean): void {
    if (!this.membership.setOpen(open)) return;
    // Passive hints are filtered through isMember/canJoin, so an open-room
    // transition can make already-detected callers dialable immediately.
    this.mesh.scheduleDialFromDiscovery();
    // Re-run the membership trim if we just locked the room down so any
    // already-connected non-members are dropped immediately.
    if (!open) this.evictNonMembers();
  }

  /**
   * Feed the active mesh client with the bridge-level live-call detector.
   * The detector is driven by the same kind 20078 beacons shown in the
   * pre-join UI, so using it here prevents a split-brain state where the
   * room says people are present but the joined WebRTC client never dials
   * them because its dedicated ephemeral roster REQ missed the beacon.
   */
  setPassiveParticipantHints(
    pubkeys: readonly string[] = [],
    options: { merge?: boolean } = {},
  ): void {
    this.mesh.setPassiveParticipantHints(pubkeys, options);
  }

  /** Live-flip the topology after a channel-kind reclassification; see `topology-switch.ts`. */
  setExpectSfu(expect: boolean): void {
    this.topology.setExpectSfu(expect);
  }

  /**
   * Update the trusted member / admin lists at runtime. Existing peers from
   * pubkeys that just dropped out of the member set are torn down.
   */
  updateRoles(members: readonly string[], admins: readonly string[]): void {
    this.membership.update(members, admins);
    // Drain any deferred signals from peers we've now admitted. Runs
    // BEFORE the eviction loop so a peer who was newly admitted then
    // immediately demoted (rare but possible if 39002 oscillates)
    // still gets their queued offer applied - `tearDownPeer` will
    // clean up afterwards.
    this.mesh.drainDeferredSignals();
    if (this.membership.open) return;
    this.evictNonMembers();
  }

  /** Tear down every live peer the membership no longer admits. */
  private evictNonMembers(): void {
    for (const pk of Array.from(this.room.peers.keys())) {
      if (!this.isMember(pk)) this.mesh.tearDownPeer(pk);
    }
  }

  /** True when the local user is allowed to publish a beacon. */
  canJoin(): boolean {
    return this.membership.canJoin();
  }

  /** NIP-29 membership plus the mesh session's pseudo-members. */
  isMember(pubkey: string): boolean {
    return this.membership.isMember(pubkey, this.mesh);
  }

  isAdmin(pubkey: string): boolean {
    return this.membership.isAdmin(pubkey);
  }

  /** User changed their outbound camera quality. Re-apply the constraints
   *  and update encoder caps on every peer. */
  applyVideoQuality(q: VideoQuality): Promise<void> {
    return this.localMedia.applyVideoQuality(q);
  }

  /** User changed their incoming-quality preference. Broadcast a qualityhint
   *  to every peer so they cap their outbound video to us. */
  broadcastReceivedQuality(q: VideoQuality): Promise<void> {
    return this.localMedia.broadcastReceivedQuality(q);
  }

  // ── Local-media controls ───────────────────────────────────────────────

  setMicEnabled(on: boolean): Promise<void> {
    return this.localMedia.setMicEnabled(on);
  }

  setCameraEnabled(on: boolean): Promise<void> {
    return this.localMedia.setCameraEnabled(on);
  }

  /** Flip between the front and back camera; a no-op while the camera is off. */
  switchCamera(): Promise<void> {
    return this.localMedia.switchCamera();
  }

  getCameraFacing(): 'user' | 'environment' {
    return this.localMedia.getCameraFacing();
  }

  setScreenShareEnabled(on: boolean): Promise<void> {
    return this.localMedia.setScreenShareEnabled(on);
  }

  getLocalTracks(): { mic: MediaStreamTrack | null; camera: MediaStreamTrack | null; screen: MediaStreamTrack | null } {
    return this.localMedia.getLocalTracks();
  }

  /**
   * Silence all incoming audio. Doesn't affect what we publish - peers still
   * hear us if our mic is on. Implemented by disabling the receive side of
   * each remote audio track; new arrivals inherit the flag in `onRemoteTrack`.
   */
  setDeafenEnabled(on: boolean): void {
    this.room.setDeafened(on);
  }

  isDeafened(): boolean {
    return this.room.deafened;
  }

  // ── Video-slot cap (room-wide) ─────────────────────────────────────────

  /** Number of video slots in use across the room; the camera and screen
   *  buttons disable when it reaches the cap. */
  getVideoSlotsInUse(): number {
    return this.localMedia.getVideoSlotsInUse();
  }

  getVideoSlotsAvailable(): number {
    return this.localMedia.getVideoSlotsAvailable();
  }

  /**
   * Toggle local-only mute for a single peer. Shorthand around the voice
   * store entry - VoiceRoom binds `<audio>.muted` to the same flag, so the
   * UI applies it automatically. No Nostr traffic; purely local.
   */
  setPeerMuted(pubkey: string, muted: boolean): void {
    this.ui.setPeerMuted(pubkey, muted);
  }

  /** Test/debug helper - exposes the connected-peer set used to populate
   *  the next beacon's `connectedTo` p-tags. */
  getConnectedPubkeys(): string[] {
    return Array.from(this.room.connectedPubkeys);
  }

}
