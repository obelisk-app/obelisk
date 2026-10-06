/**
 * The dial loop of a mesh room: from everything discovery knows (relay
 * beacons, their `p` tags, control-channel snapshots, active-call hints)
 * decide whom to connect to under the participant cap, open the missing
 * `Peer`s, evict the cap violators and the peers nothing vouches for any
 * more, and tear a peer down without leaving state behind.
 *
 * Owned by `MeshSession`, which is its `MeshDialHost`; a `Peer`'s event
 * wiring reaches the loop through the session's `MeshPeerHost` surface.
 */
import { openMeshPeer, type MeshPeerHost } from './mesh-peer';
import { pushVoiceDebug } from './debug';
import { MAX_PARTICIPANTS } from './constants';

/** What the dial loop needs from the session that owns it. */
export interface MeshDialHost extends MeshPeerHost {
  /** NIP-29 membership plus the session's pseudo-members; the client decides. */
  isMember(pubkey: string): boolean;
  /** The passive participant hints from the bridge's kind 20078 watcher. */
  hints(): ReadonlySet<string>;
}

export class MeshDialer {
  /**
   * Pubkeys seen in any roster snapshot since join. A NEW peer's first
   * appearance schedules a beacon refresh so that peer learns about us
   * within ~250 ms instead of waiting up to a full `BEACON_INTERVAL_MS`.
   */
  private seenRosterPubkeys = new Set<string>();
  /** Coalesce dial-loop runs triggered by control-channel propagation
   *  arriving in microtask order during a single hello. */
  private dialDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: MeshDialHost) {}

  /** Cancel a pending debounced dial and forget the first-sighting set. */
  reset(): void {
    if (this.dialDebounceTimer) { clearTimeout(this.dialDebounceTimer); this.dialDebounceTimer = null; }
    this.seenRosterPubkeys.clear();
    this.host.discovery.reset();
  }

  /** Cancel a pending debounced dial only (the session's `stopTimers`). */
  stop(): void {
    if (this.dialDebounceTimer) { clearTimeout(this.dialDebounceTimer); this.dialDebounceTimer = null; }
  }

  /**
   * Mesh-only roster handler, fed the membership-filtered transitive
   * participant set. The SFU path bypasses this entirely: it mirrors the
   * SFU's pushed participant list straight into the room's roster.
   */
  handleRoster(pubkeys: string[]): void {
    const { host } = this;
    const others = pubkeys.filter((p) => p !== host.selfPubkey);
    const beforeDiscoveryKey = host.discovery.effectivePeers().slice().sort().join('|');

    // Track relay-discovered set in the discovery engine so the dial-loop
    // sees the union of relay + control-channel sources. Increment the
    // attribution counter for any peer the relay just told us about that
    // we hadn't seen on the relay before.
    const previouslyRelay = new Set(others.filter((p) => host.discovery.source(p).relay));
    host.discovery.setRelayDiscovered(others);
    const afterDiscoveryKey = host.discovery.effectivePeers().slice().sort().join('|');
    let relayNew = 0;
    for (const p of others) {
      if (!previouslyRelay.has(p)) relayNew++;
    }
    host.metrics.transitive.discoveredViaRelay += relayNew;

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
    if (sawNew || beforeDiscoveryKey !== afterDiscoveryKey) {
      host.scheduleBeaconRefresh();
      host.scheduleControlPeerSnapshot();
    }

    this.runDialLoop();
  }

  applyControlPeerSnapshot(remotePubkey: string, peers: readonly string[]): void {
    const { host } = this;
    const filtered = peers
      .filter((pk) => pk && pk !== host.selfPubkey)
      .filter((pk) => host.isMember(pk));
    const { added, removed } = host.discovery.setControlDiscovered(remotePubkey, filtered);
    if (added.length === 0 && removed.length === 0) return;
    host.metrics.transitive.discoveredViaControl += added.length;
    this.scheduleDialFromDiscovery();
    host.scheduleBeaconRefresh();
    host.scheduleControlPeerSnapshot();
  }

  /**
   * Coalesce dial loops triggered by control-channel propagation arriving
   * in microtask order during a single hello / peerAdded burst. Without
   * the debounce a hello carrying N peers would spawn N PCs in microtask
   * order while we're still applying the previous offer. 100 ms is small
   * enough to feel instant, large enough to absorb the typical hello.
   */
  scheduleDialFromDiscovery(): void {
    if (this.dialDebounceTimer) return;
    this.dialDebounceTimer = setTimeout(() => {
      this.dialDebounceTimer = null;
      this.runDialLoop();
    }, 100);
  }

  /**
   * Everyone we believe is in the room, minus self: discovery (beacons,
   * their `p` tags, control snapshots), active-call hints and live peers.
   * The single input to both cap checks, `runDialLoop` deciding whom to
   * dial and the signal router's `isWithinRoomCap` deciding whom to
   * answer, so they agree on who the fifth person is.
   */
  roomCandidates(): string[] {
    const { host } = this;
    const set = new Set<string>([
      ...host.discovery.effectivePeers(),
      ...host.hints(),
    ]);
    for (const [pk, peer] of host.room.peers.entries()) {
      if (host.room.connectedPubkeys.has(pk) || peer.isControlOpen()) set.add(pk);
    }
    set.delete(host.selfPubkey);
    return Array.from(set).filter((p) => host.isMember(p));
  }

  /**
   * Apply the current discovery set: cap, dial new peers, evict cap
   * violators. Called from `handleRoster` (relay-driven) and from
   * `scheduleDialFromDiscovery` (control-channel-driven). Idempotent.
   */
  runDialLoop(): void {
    const { host } = this;
    const room = host.room;
    const others = this.roomCandidates();

    // Hard cap: if more than MAX_PARTICIPANTS would be present and we're
    // not in the leading slice, deterministically (lex) trim the tail so
    // every client agrees on the same set of cap-violators.
    const visible = others.slice();
    if (visible.length + 1 > MAX_PARTICIPANTS) {
      visible.sort();
      visible.splice(MAX_PARTICIPANTS - 1);
    }
    const visibleSet = new Set(visible);

    // Peers that lost every discovery source and are not currently live
    // should disappear immediately. The old union kept all open Peer
    // objects forever, so a tab that closed before/after negotiation could
    // remain rendered until a refresh even after its beacon expired.
    for (const [pk, peer] of Array.from(room.peers.entries())) {
      if (visibleSet.has(pk)) continue;
      if (room.connectedPubkeys.has(pk) || peer.isControlOpen()) continue;
      this.tearDownPeer(pk);
    }

    // Union of discovered pubkeys + actually-live peers. Connected/control
    // peers stay visible across relay beacon gaps; non-live stale peers do
    // not.
    const union = new Set(visible);
    for (const [pk, peer] of room.peers.entries()) {
      if (room.connectedPubkeys.has(pk) || peer.isControlOpen()) union.add(pk);
    }
    room.setRoster(Array.from(union));

    for (const p of visible) {
      if (!room.peers.has(p)) openMeshPeer(host, p);
    }
    // Cap-overflow eviction.
    if (room.peers.size + 1 > MAX_PARTICIPANTS) {
      const keep = new Set(Array.from(room.peers.keys()).sort().slice(0, MAX_PARTICIPANTS - 1));
      for (const pk of Array.from(room.peers.keys())) {
        if (!keep.has(pk)) this.tearDownPeer(pk);
      }
    }
  }

  /**
   * Tear down a peer connection and clean up every state map that referred
   * to it: speaking detector, remote tracks, connected set, store entry.
   * Single source of truth so we don't leak state on partial cleanup paths.
   *
   * Order matters: we delete from `room.peers` BEFORE calling `peer.close()`
   * because `pc.close()` fires `onconnectionstatechange('closed')`
   * synchronously, and the listener checks `room.peers.get(pubkey) === peer`
   * to decide whether to clean up. With the entry still in the map at that
   * moment, the listener would re-enter `tearDownPeer` and recurse.
   */
  tearDownPeer(pubkey: string, preservePresence = false): void {
    const { host } = this;
    const room = host.room;
    const peer = room.peers.get(pubkey);
    const droppedClaims = host.discovery.dropClaimsFromPeer(pubkey);
    if (droppedClaims.length > 0) {
      host.scheduleBeaconRefresh();
      host.scheduleControlPeerSnapshot();
    }
    if (peer) {
      room.peers.delete(pubkey);
      // Internal connection rebuilds must not announce that the user left
      // the call. Their live kind-20078 beacon remains the presence source.
      peer.close({ notifyRemote: false });
      host.metrics.peers.tornDown++;
      pushVoiceDebug({ kind: 'peer-torn-down', peer: pubkey });
    }
    const nextRoster = preservePresence
      ? room.rosterPubkeys
      : room.rosterPubkeys.filter((pk) => pk !== pubkey);
    const rosterChanged = nextRoster.length !== room.rosterPubkeys.length;
    if (rosterChanged) room.setRoster(nextRoster);
    room.removeRemoteTracksFor(pubkey);
    room.detachSpeakingDetector(pubkey);
    if (room.connectedPubkeys.delete(pubkey)) {
      host.metrics.peers.connected = room.connectedPubkeys.size;
      host.scheduleBeaconRefresh();
    }
    if (peer || rosterChanged || droppedClaims.length > 0) {
      host.scheduleControlPeerSnapshot();
    }
    room.ui.clearPeerQuality(pubkey);
    room.emitPeerConnectionStates();
  }
}
