/**
 * How one mesh `Peer` is wired into the room.
 *
 * `openMeshPeer` builds the `Peer` for a remote pubkey and binds its events
 * (remote tracks, connection state, the `obelisk-control` discovery
 * messages, fast hangups, session rebuilds) to the room state and the
 * mesh session that owns it. The session is reached through
 * `MeshPeerHost`, the small surface `MeshSession` implements, so this
 * module does not import the session and the dependency runs one way.
 */
import { Peer } from './peer';
import type { RoomState } from './room-state';
import type { LocalMedia } from './local-media';
import type { DiscoveryEngine } from './discovery';
import type { VoiceTransport } from './transport';
import type { VoiceMetrics } from './metrics';
import type { VoicePresence, VoiceSignalPayload } from './types';
import { pushVoiceDebug } from './debug';
import { SELF_BUILD_TAG, SIGNER_PEER_BUDGET, type VoiceSigner } from '@/constants/voice/client';
import { withRateLimitBackoff } from './failure-handlers';

/** What a mesh peer's event wiring needs from the session that owns it. */
export interface MeshPeerHost {
  readonly channelId: string;
  readonly selfPubkey: string;
  readonly signer: VoiceSigner;
  readonly room: RoomState;
  readonly transport: VoiceTransport;
  readonly metrics: VoiceMetrics;
  readonly discovery: DiscoveryEngine;
  readonly localMedia: LocalMedia;
  /** Pubkeys whose `Peer` is being constructed right now (re-entrancy guard). */
  readonly openingPeers: Set<string>;
  isJoined(): boolean;
  sfuPubkey(): string | null;
  isKnownSfu(pubkey: string): boolean;
  isKnownMeshTestPeer(pubkey: string): boolean;
  hasPassiveHint(pubkey: string): boolean;
  roster(): readonly VoicePresence[];
  meshKnownPubkeys(): string[];
  applyControlPeerSnapshot(remotePubkey: string, peers: readonly string[]): void;
  scheduleDialFromDiscovery(): void;
  scheduleBeaconRefresh(): void;
  scheduleControlPeerSnapshot(): void;
  tearDownPeer(pubkey: string, preservePresence?: boolean): void;
  routeSignal(fromPubkey: string, payload: VoiceSignalPayload): Promise<void>;
  runDialLoop(): void;
  /** The remote said the room is full; the owner leaves. */
  onRoomFull(): void;
}

export function randomId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function shouldKickRecvOnlyOffer(host: MeshPeerHost, remotePubkey: string, isSfuPeer: boolean, polite: boolean): boolean {
  if (isSfuPeer) return true;
  if (host.isKnownMeshTestPeer(remotePubkey)) return true;
  if (host.hasPassiveHint(remotePubkey)) return true;
  if (polite) return false;
  const presence = host.roster().find((p) => p.pubkey === remotePubkey);
  return (presence?.videoTracks?.length ?? 0) > 0;
}

export function openMeshPeer(host: MeshPeerHost, remotePubkey: string): void {
  const room = host.room;
  // Defensive: after leave() the client should never spin up new peers.
  // Late-arriving rosters can otherwise trigger openPeer post-teardown
  // and the resulting RTCPeerConnection would never be cleaned up.
  if (!host.isJoined()) return;
  if (room.peers.has(remotePubkey) || host.openingPeers.has(remotePubkey)) return;
  // SFU peer is handled by `SfuClient`/mediasoup-client, not by the mesh
  // simple-peer path. Don't construct a `Peer` for it.
  const sfuPubkey = host.sfuPubkey();
  if (sfuPubkey && remotePubkey === sfuPubkey) return;
  // Lexicographic roles give exactly one simple-peer initiator per pair.
  // EXCEPTION: peers that are an SFU are ALWAYS treated as remote-impolite
  // (so we are polite). werift's SFU implementation cannot roll back its
  // own offer; if pubkey ordering happened to put the SFU on the polite
  // side, every renegotiation deadlocks with both sides dropping the
  // other's offer. Forcing the browser to be polite for SFU peers keeps
  // simple-peer initiator invariants while accommodating werift.
  const isSfuPeer = host.isKnownSfu(remotePubkey);
  const isMeshTestPeer = host.isKnownMeshTestPeer(remotePubkey);
  const polite = isSfuPeer ? true : isMeshTestPeer ? false : host.selfPubkey > remotePubkey;
  const shouldKickRecvOnly = shouldKickRecvOnlyOffer(host, remotePubkey, isSfuPeer, polite);
  console.log('[voice] openPeer', remotePubkey.slice(0, 8),
    'polite=', polite, isSfuPeer ? '(sfu)' : isMeshTestPeer ? '(mesh-test-peer)' : '');
  host.openingPeers.add(remotePubkey);
  let peer: Peer | null = null;
  try {
    const createdPeer = new Peer({
      remotePubkey,
      polite,
      // Per connection, not per client: a rebuilt Peer must not accept
      // answers and candidates the remote sent to the one it replaced.
      sessionId: randomId(),
      ...SIGNER_PEER_BUDGET[host.signer],
      bootstrapRecvOnlyMedia: shouldKickRecvOnly,
      send: (payload) => withRateLimitBackoff(
        () => host.transport.sendSignal(host.channelId, remotePubkey, payload),
        { metrics: host.metrics },
      ),
      // SFU peers don't speak our control-channel protocol; only mesh
      // peers get the obelisk-control data channel. The flag is the same
      // one we use to force polite negotiation for SFUs.
      control: isSfuPeer ? undefined : {
        selfBuild: SELF_BUILD_TAG,
        metrics: host.metrics,
        getCurrentPeers: () => host.meshKnownPubkeys(),
      },
      events: {
        onTransitivePeers: (peers, _build) => {
          host.applyControlPeerSnapshot(remotePubkey, peers);
        },
        onControlPeerSnapshot: (peers) => {
          host.applyControlPeerSnapshot(remotePubkey, peers);
        },
        onControlPeerAdded: (pubkey) => {
          if (pubkey === host.selfPubkey) return;
          if (host.discovery.addControlDiscovered(pubkey, remotePubkey)) {
            host.metrics.transitive.discoveredViaControl++;
            host.scheduleDialFromDiscovery();
            host.scheduleBeaconRefresh();
            host.scheduleControlPeerSnapshot();
          }
        },
        onControlPeerRemoved: (pubkey) => {
          if (host.discovery.removeControlDiscovered(pubkey, remotePubkey)) {
            host.scheduleDialFromDiscovery();
            host.scheduleBeaconRefresh();
            host.scheduleControlPeerSnapshot();
          }
        },
        onPeerDead: (reason) => {
          // Active capacity rejection: the remote is telling us the room
          // is full. Surface a clean error and leave; without this, our
          // repeated redial attempts would loop trying to re-dial them.
          if (reason === 'bye:room-full') {
            pushVoiceDebug({
              kind: 'pc-state',
              peer: remotePubkey,
              payload: { event: 'rejected-room-full' },
            });
            host.metrics.peers.tornDown++;
            try { room.events.onError?.('roomFull'); }
            catch (e) { console.warn('[voice] onError threw on room-full', e); }
            // Use a microtask so the current signal-routing call returns
            // before we dismantle our own state.
            queueMicrotask(() => host.onRoomFull());
            return;
          }
          // FAST hangup: control channel detected the peer is gone. Route
          // through tearDownPeer (idempotent) so the rest of the cleanup
          // happens identically to the relay-bye / connectionState='closed'
          // paths. The bye-via-control split counter helps the diagnostic
          // overlay distinguish the source.
          if (reason.startsWith('bye:')) {
            host.metrics.signals.byeViaControl++;
          }
          host.metrics.peers.tornDown++;
          pushVoiceDebug({
            kind: 'pc-state',
            peer: remotePubkey,
            payload: { event: 'fast-hangup', reason },
          });
          // Remove anything this peer claimed transitively so we don't
          // keep re-dialing through them.
          host.discovery.dropClaimsFromPeer(remotePubkey);
          host.scheduleBeaconRefresh();
          host.scheduleControlPeerSnapshot();
          // A silent rebuild (timeout, lost heartbeat) must take the remote
          // with it, or it keeps negotiating against a Peer that is gone.
          // Not when the remote asked for this reset; that would echo.
          if (!reason.startsWith('bye:') && reason !== 'reset-requested') peer?.requestReset();
          host.tearDownPeer(remotePubkey, !reason.startsWith('bye:'));
          if (!reason.startsWith('bye:')) host.scheduleDialFromDiscovery();
        },
        onRemoteSessionChanged: (offer) => {
          if (room.peers.get(remotePubkey) !== peer) return;
          pushVoiceDebug({ kind: 'pc-state', peer: remotePubkey, payload: { event: 'remote-session-changed' } });
          // The remote already rebuilt: no requestReset. Replace our Peer
          // and give the new one the offer that revealed the new session.
          host.tearDownPeer(remotePubkey, true);
          void host.routeSignal(remotePubkey, offer);
        },
        onRemoteTrack: (track, stream, kind, originPubkey) => {
          // In SFU mode `originPubkey` differs from `remotePubkey` (the SFU
          // is the RTC peer; the participant who actually produced the
          // media is the origin). Tile mapping uses the origin so the
          // sound shows up on the right person's tile, not the SFU's.
          room.addRemoteTrack({
            pubkey: originPubkey ?? remotePubkey,
            viaPubkey: remotePubkey,
            trackId: track.id,
            kind,
            stream,
          }, track);
        },
        onRemoteTrackEnded: (trackId) => {
          room.endRemoteTrack(trackId);
        },
        onConnectionEstablished: () => {
          if (!room.connectedPubkeys.has(remotePubkey)) {
            host.metrics.peers.connected = room.connectedPubkeys.size + 1;
          }
          room.connectedPubkeys.add(remotePubkey);
          host.metrics.peers.ever++;
          pushVoiceDebug({ kind: 'pc-state', peer: remotePubkey, payload: 'connected' });
          host.scheduleBeaconRefresh();
          // Tell every OTHER mesh peer about this new connection so they
          // can transitively discover us through this one. The control
          // channel may not be open yet on this peer; that's fine: its
          // own `hello` will carry the up-to-date list when it opens.
          for (const [otherPk, otherPeer] of room.peers.entries()) {
            if (otherPk === remotePubkey) continue;
            otherPeer.broadcastControl({ type: 'peerAdded', pubkey: remotePubkey });
          }
          host.scheduleControlPeerSnapshot();
          room.emitPeerConnectionStates();
        },
        onConnectionLost: () => {
          if (room.connectedPubkeys.delete(remotePubkey)) {
            host.scheduleBeaconRefresh();
          }
          for (const [otherPk, otherPeer] of room.peers.entries()) {
            if (otherPk === remotePubkey) continue;
            otherPeer.broadcastControl({ type: 'peerRemoved', pubkey: remotePubkey });
          }
          host.scheduleControlPeerSnapshot();
          room.emitPeerConnectionStates();
          host.runDialLoop();
        },
        onQualitySample: (sample) => {
          room.ui.setPeerQuality(remotePubkey, sample);
        },
        onConnectionStateChange: (state) => {
          room.emitPeerConnectionStates();
          if (state === 'closed') {
            // Drop the peer so a future signal/beacon from the same pubkey
            // can spawn a fresh PC instead of routing into a dead one.
            // simple-peer owns ICE negotiation; a terminal close is the point
            // where discovery should create a fresh connection.
            const p = room.peers.get(remotePubkey);
            if (p && p === peer) {
              p.requestReset();
              host.tearDownPeer(remotePubkey, true);
              host.scheduleDialFromDiscovery();
            }
          }
        },
      },
    });
    peer = createdPeer;
    room.peers.set(remotePubkey, createdPeer);
    room.emitPeerConnectionStates();
  } finally {
    host.openingPeers.delete(remotePubkey);
  }
  if (!peer) return;

  // Push existing local tracks to the new peer. Muted joins still need
  // recv-only media sections on at least one side of the pair; otherwise
  // a listener can see the roster/control state but have no audio/video
  // m-lines to receive a peer who was already publishing mic audio.
  // The impolite side drives that initial recv-only offer for ordinary
  // browser peers. Special peers can force it regardless of polarity.
  const opened = peer;
  void host.localMedia.attachAllTo(opened).then(() => {
    if (shouldKickRecvOnly || !polite) {
      void opened.kickInitialOffer();
    }
  });
}
