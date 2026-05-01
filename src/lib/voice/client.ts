/**
 * VoiceClient orchestrates a peer mesh inside a single channel:
 * - publishes presence beacons on a 15s cadence
 * - subscribes to the roster + opens a `Peer` per remote pubkey
 * - subscribes to incoming signaling and routes to the right `Peer`
 * - manages local mic / camera / screenshare tracks across all peers
 *
 * Pure-Nostr; no `server.ts` dependency. v1 cap: 4 participants.
 */
import { Peer } from './peer';
import type { VoiceSignalPayload, VoiceTrackKind, VoiceQualityHint } from './types';
import {
  publishPresenceBeacon,
  subscribeRoster,
  sendSignal,
  subscribeSignals,
  getSelfPubkey,
} from './transport';
import { getPreset, MIC_CONSTRAINTS, type VideoQuality } from './quality';
import { useVoiceStore } from '@/store/voice';

const BEACON_INTERVAL_MS = 15_000;
const MAX_PARTICIPANTS = 4;

export interface RemoteTrack {
  pubkey: string;
  trackId: string;
  kind: VoiceTrackKind;
  stream: MediaStream;
}

export interface VoiceClientEvents {
  onParticipantsChange?(pubkeys: string[]): void;
  onRemoteTracksChange?(tracks: RemoteTrack[]): void;
  onLocalTracksChange?(local: { mic: boolean; camera: boolean; screen: boolean }): void;
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

  private peers = new Map<string, Peer>();
  private remoteTracks = new Map<string, RemoteTrack>(); // key: trackId
  private rosterPubkeys: string[] = [];

  private micTrack: MediaStreamTrack | null = null;
  private camTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private screenAudioTrack: MediaStreamTrack | null = null;

  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  private rosterUnsub: (() => void) | null = null;
  private signalsUnsub: (() => void) | null = null;
  private joined = false;
  private deafened = false;

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
          this.peers.get(pk)?.close();
          this.peers.delete(pk);
          this.removeRemoteTracksFor(pk);
        }
      }
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
        this.peers.get(pk)?.close();
        this.peers.delete(pk);
        this.removeRemoteTracksFor(pk);
      }
    }
  }

  /** True when the local user is allowed to publish a beacon. */
  canJoin(): boolean {
    return this.openRoom || this.members.has(this.selfPubkey) || this.admins.has(this.selfPubkey);
  }

  isMember(pubkey: string): boolean {
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

    // Mic-on by default — voice channels are voice-first.
    await this.setMicEnabled(true);

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
      const filtered = roster.filter((r) => this.isMember(r.pubkey));
      this.handleRoster(filtered.map((r) => r.pubkey));
    });

    await publishPresenceBeacon(this.channelId);
    // Re-emit a few times in the first ~5s so a peer who arrives just after
    // us still sees our beacon even if their relay session doesn't backfill
    // ephemeral events. Cheap insurance against relays that don't push
    // already-stored ephemerals to fresh subscribers.
    setTimeout(() => { void publishPresenceBeacon(this.channelId).catch(() => {}); }, 1500);
    setTimeout(() => { void publishPresenceBeacon(this.channelId).catch(() => {}); }, 4000);
    this.beaconTimer = setInterval(() => {
      void publishPresenceBeacon(this.channelId).catch(() => {});
    }, BEACON_INTERVAL_MS);
  }

  async leave(): Promise<void> {
    if (!this.joined) return;
    this.joined = false;
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
    this.signalsUnsub?.();
    this.signalsUnsub = null;
    this.rosterUnsub?.();
    this.rosterUnsub = null;

    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.remoteTracks.clear();
    this.events.onRemoteTracksChange?.([]);

    this.stopTrack(this.micTrack); this.micTrack = null;
    this.stopTrack(this.camTrack); this.camTrack = null;
    this.stopTrack(this.screenTrack); this.screenTrack = null;
    this.stopTrack(this.screenAudioTrack); this.screenAudioTrack = null;
    this.emitLocal();
    this.events.onLeft?.();
  }

  // -- roster + peer management ---------------------------------------------

  private handleRoster(pubkeys: string[]) {
    const others = pubkeys.filter((p) => p !== this.selfPubkey);

    // v1 hard cap: if more than 4 are present and we're not in the leading 4,
    // bail out. Lexicographic on (we already have createdAt order baked in
    // from transport.ts; here we just trim).
    if (others.length + 1 > MAX_PARTICIPANTS) {
      // Keep only the lexicographically-smallest peers (deterministic across
      // all participants), so all clients agree on who the cap-violators are.
      others.sort();
      others.splice(MAX_PARTICIPANTS - 1);
    }

    // Union of roster pubkeys + already-open peers (some peers are discovered
    // via incoming signaling when relays don't deliver beacons symmetrically).
    // We expose this union to the UI so a peer never disappears mid-call just
    // because their beacon didn't reach our subscription.
    const union = new Set(others);
    for (const pk of this.peers.keys()) union.add(pk);
    this.rosterPubkeys = Array.from(union);
    this.events.onParticipantsChange?.([...this.rosterPubkeys]);

    // Open peer connections for new beacons. Do NOT close peers just because
    // they're missing from this roster snapshot — beacon delivery is best-
    // effort on ephemeral kinds and many relays drop them on existing subs.
    // Cleanup happens on explicit bye / RTC failure / cap-overflow.
    const wanted = new Set(others);
    for (const pk of wanted) {
      if (!this.peers.has(pk)) this.openPeer(pk);
    }
    // Cap-overflow eviction: if total peers exceeds the limit, evict the ones
    // that fall outside the leading slice (deterministic by lex order).
    if (this.peers.size + 1 > MAX_PARTICIPANTS) {
      const keep = new Set(Array.from(this.peers.keys()).sort().slice(0, MAX_PARTICIPANTS - 1));
      for (const pk of Array.from(this.peers.keys())) {
        if (!keep.has(pk)) {
          this.peers.get(pk)?.close();
          this.peers.delete(pk);
          this.removeRemoteTracksFor(pk);
        }
      }
    }
  }

  private openPeer(remotePubkey: string) {
    // Lexicographically-greater pubkey is polite (rolls back on glare).
    const polite = this.selfPubkey > remotePubkey;
    console.log('[voice] openPeer', remotePubkey.slice(0, 8), 'polite=', polite);
    const peer = new Peer({
      remotePubkey,
      polite,
      sessionId: this.sessionId,
      send: (payload) => sendSignal(this.channelId, remotePubkey, payload),
      events: {
        onRemoteTrack: (track, stream, kind) => {
          // Apply current deafen state to brand-new audio arrivals so a peer
          // who joins after we deafened doesn't suddenly become audible.
          if (this.deafened && (kind === 'audio' || kind === 'screen-audio')) {
            track.enabled = false;
          }
          this.remoteTracks.set(track.id, { pubkey: remotePubkey, trackId: track.id, kind, stream });
          this.emitRemoteTracks();
        },
        onRemoteTrackEnded: (trackId) => {
          this.remoteTracks.delete(trackId);
          this.emitRemoteTracks();
        },
        onQualitySample: (sample) => {
          useVoiceStore.getState().setPeerQuality(remotePubkey, sample);
        },
        onConnectionStateChange: (state) => {
          if (state === 'failed' || state === 'closed') {
            console.warn(`[voice] peer ${remotePubkey.slice(0, 8)} → ${state}`);
            // Drop the peer so a future signal/beacon from the same pubkey
            // can spawn a fresh PC instead of routing into a dead one.
            const p = this.peers.get(remotePubkey);
            if (p) {
              p.close();
              this.peers.delete(remotePubkey);
              this.removeRemoteTracksFor(remotePubkey);
              this.events.onParticipantsChange?.([...this.rosterPubkeys.filter((pk) => pk !== remotePubkey)]);
              useVoiceStore.getState().clearPeerQuality(remotePubkey);
            }
          }
        },
      },
    });

    // Push existing local tracks to the new peer.
    void this.attachAllLocalTracks(peer);

    this.peers.set(remotePubkey, peer);
  }

  private async attachAllLocalTracks(peer: Peer) {
    if (this.micTrack) await peer.setLocalTrack('audio', this.micTrack);
    if (this.camTrack) await peer.setLocalTrack('camera', this.camTrack);
    if (this.screenTrack) await peer.setLocalTrack('screen', this.screenTrack);
    if (this.screenAudioTrack) await peer.setLocalTrack('screen-audio', this.screenAudioTrack);
    // Push the user-chosen outbound cap and our receive hint so a peer who
    // joins mid-call inherits the same quality contract as existing peers.
    const { videoQuality, receivedVideoQuality } = useVoiceStore.getState();
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
    for (const [id, t] of Array.from(this.remoteTracks.entries())) {
      if (t.pubkey === pubkey) { this.remoteTracks.delete(id); changed = true; }
    }
    if (changed) this.emitRemoteTracks();
  }

  private async routeSignal(fromPubkey: string, payload: VoiceSignalPayload): Promise<void> {
    let peer = this.peers.get(fromPubkey);
    if (!peer) {
      // Roster may not have caught up yet; create the peer eagerly so the
      // initial offer doesn't get dropped on join.
      this.openPeer(fromPubkey);
      peer = this.peers.get(fromPubkey)!;
    }
    await peer.handleSignal(payload);
  }

  // -- local-media controls --------------------------------------------------

  async setMicEnabled(on: boolean): Promise<void> {
    if (on && !this.micTrack) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: MIC_CONSTRAINTS,
      });
      this.micTrack = stream.getAudioTracks()[0] ?? null;
      if (this.micTrack) {
        for (const peer of this.peers.values()) await peer.setLocalTrack('audio', this.micTrack);
      }
    } else if (!on && this.micTrack) {
      for (const peer of this.peers.values()) await peer.setLocalTrack('audio', null);
      this.stopTrack(this.micTrack);
      this.micTrack = null;
    }
    this.emitLocal();
  }

  async setCameraEnabled(on: boolean): Promise<void> {
    console.log('[voice] setCameraEnabled', on, 'peers=', this.peers.size);
    if (on && !this.camTrack) {
      const quality = useVoiceStore.getState().videoQuality;
      const preset = getPreset(quality);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: preset.constraints,
      });
      this.camTrack = stream.getVideoTracks()[0] ?? null;
      console.log('[voice] camera acquired, track=', this.camTrack?.id, 'quality=', quality);
      if (this.camTrack) {
        const cap = { maxBitrate: preset.maxBitrate, maxFramerate: preset.maxFramerate };
        for (const peer of this.peers.values()) {
          await peer.setLocalTrack('camera', this.camTrack);
          await peer.setLocalVideoCap(cap);
        }
      }
    } else if (!on && this.camTrack) {
      for (const peer of this.peers.values()) await peer.setLocalTrack('camera', null);
      this.stopTrack(this.camTrack);
      this.camTrack = null;
    }
    this.emitLocal();
  }

  async setScreenShareEnabled(on: boolean): Promise<void> {
    if (on && !this.screenTrack) {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true,
      });
      this.screenTrack = stream.getVideoTracks()[0] ?? null;
      this.screenAudioTrack = stream.getAudioTracks()[0] ?? null;
      if (this.screenTrack) {
        for (const peer of this.peers.values()) await peer.setLocalTrack('screen', this.screenTrack);
      }
      if (this.screenAudioTrack) {
        for (const peer of this.peers.values()) await peer.setLocalTrack('screen-audio', this.screenAudioTrack);
      }
      // Browser-driven stop ("Stop sharing" toolbar button) — clean up.
      if (this.screenTrack) {
        this.screenTrack.onended = () => { void this.setScreenShareEnabled(false); };
      }
    } else if (!on) {
      if (this.screenTrack) {
        for (const peer of this.peers.values()) await peer.setLocalTrack('screen', null);
        this.stopTrack(this.screenTrack);
        this.screenTrack = null;
      }
      if (this.screenAudioTrack) {
        for (const peer of this.peers.values()) await peer.setLocalTrack('screen-audio', null);
        this.stopTrack(this.screenAudioTrack);
        this.screenAudioTrack = null;
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

  // -- helpers ---------------------------------------------------------------

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
