/**
 * How a `VoiceClient` is put together: the transport, the shared room
 * state, local media, the active-call watcher and the two topology
 * sessions, wired to each other through closures so each one looks the
 * others up lazily (the topology can flip mid-call). The client keeps the
 * lifecycle flags the hooks read; nothing here runs until `join()`.
 */
import { createVoiceTransport, type VoiceTransport } from './transport';
import { RoomState } from './room-state';
import { LocalMedia } from './local-media';
import { ActiveCallWatcher } from './active-call-watcher';
import { SfuSession } from './sfu-session';
import { MeshSession } from './mesh-session';
import type { VoiceUiSink } from './ui-sink';
import type { VoiceMetrics } from './metrics';
import type { VoiceClientOptions } from './client-options';

/** What the collaborators read back from the client while running. */
export interface VoiceRoomHooks {
  isJoined(): boolean;
  /** NIP-29 membership plus the mesh session's pseudo-members. */
  isMember(pubkey: string): boolean;
  /** Whether the channel currently asks for an SFU. */
  expectSfu(): boolean;
  /** The remote said the room is full; the client leaves. */
  onRoomFull(): void;
  /** A roster or signal REQ was rate-limit CLOSEd and is backing off (or recovered). */
  onSubscriptionDegraded(which: 'roster' | 'signals', degraded: boolean): void;
}

export interface VoiceRoomParts {
  transport: VoiceTransport;
  room: RoomState;
  localMedia: LocalMedia;
  watcher: ActiveCallWatcher;
  sfu: SfuSession;
  mesh: MeshSession;
}

export function assembleVoiceRoom(
  channelId: string,
  selfPubkey: string,
  options: VoiceClientOptions,
  ui: VoiceUiSink,
  metrics: VoiceMetrics,
  hooks: VoiceRoomHooks,
): VoiceRoomParts {
  const signer = options.signer ?? 'nsec';
  const transport = createVoiceTransport({
    relayUrl: options.originRelayUrl ?? null,
    onSubscriptionDegraded: hooks.onSubscriptionDegraded,
  });
  const room = new RoomState(selfPubkey, ui, options.events ?? {});
  // `sfu` and `mesh` are declared below; the closures resolve them at call
  // time, which is after construction.
  const localMedia: LocalMedia = new LocalMedia({
    room,
    sfu: () => sfu.client,
    roster: () => mesh.roster(),
    // Republish the beacon soon so other peers see the claim (or its
    // release) before they race past us for the slot.
    onVideoClaimChanged: () => mesh.scheduleBeaconRefresh(),
  });
  const watcher = new ActiveCallWatcher(channelId, {
    onEntry: (entry) => {
      // The entry only feeds discovery while on mesh; the SFU's own
      // participant list is authoritative otherwise.
      if (sfu.active) return;
      if (entry?.mode === 'mesh') mesh.setPassiveParticipantHints(entry.participantPubkeys ?? []);
      else mesh.setPassiveParticipantHints([]);
    },
    // A no-op without a live SfuClient (mesh mode, or a bootstrap that
    // has not finished): the session checks.
    onClosed: () => sfu.handleRemoteClosure(),
  });
  const sfu: SfuSession = new SfuSession({
    room,
    channelId,
    selfPubkey,
    metrics,
    localMedia,
    watcher,
    isJoined: hooks.isJoined,
    expectSfu: hooks.expectSfu,
  });
  const mesh: MeshSession = new MeshSession({
    channelId,
    selfPubkey,
    signer,
    // NIP-46: a human/relay round trip per signed event (slower beacon cadence).
    remoteSigning: signer === 'bunker',
    room,
    ui,
    transport,
    metrics,
    localMedia,
    watcher,
    isJoined: hooks.isJoined,
    isMember: hooks.isMember,
    sfuPubkey: () => sfu.pubkey,
    sfuActive: () => sfu.active,
    onRoomFull: hooks.onRoomFull,
  });
  return { transport, room, localMedia, watcher, sfu, mesh };
}
