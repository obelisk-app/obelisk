/**
 * What a `VoiceClient` is built with. Kept beside the client as its own
 * module so the contract reads on its own: membership, the topology the
 * channel asks for, the signer, the owner's listeners and the UI sink.
 */
import type { VoiceClientEvents } from './room-state';
import type { VoiceSigner } from '@/constants/voice/client';
import type { VoiceUiSink } from './ui-sink';

export interface VoiceClientOptions {
  /**
   * Authoritative member list for this channel (NIP-29 kind 39002 pubkeys).
   * Non-members' presence beacons and signaling events are dropped, and the
   * local user must be in this list to publish a beacon. An empty list is
   * treated as "open room", only useful for ad-hoc / dev rooms; production
   * callers should always pipe the real member list through here.
   */
  members?: readonly string[];
  /**
   * Whether the call should run on an SFU.
   *
   * `true` - at `join()`, ask `pickSfu(channelId)` for the active SFU
   *          (per-channel pin → env override → kind 31313 advertisement)
   *          and switch to SFU mode if found. Used for `voice-sfu`
   *          channels.
   * `false` (default) - stay in mesh. `pickSfu` is never consulted, so
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
   * true, anyone may join regardless of `members`/`admins`; passing the
   * member list is still useful so admin badges render correctly, but the
   * gate on join/canJoin becomes unconditional.
   */
  open?: boolean;
  /** Relay where this call was joined. Mesh voice traffic remains pinned here
   *  even when the user browses another server. */
  originRelayUrl?: string | null;
  /**
   * How the session signs. Every offer, answer and trickled ICE candidate
   * is a separate signed event, and NIP-07 / NIP-46 signatures are
   * serialized through one signer queue, so anything but a local key
   * bundles candidates into the SDP and gets a longer connect budget
   * (see `SIGNER_PEER_BUDGET`). Omitted = local key.
   */
  signer?: VoiceSigner;
  events?: VoiceClientEvents;
  /**
   * Where UI-facing state goes (speaking orbs, local mute mirror, per-peer
   * quality, errors). Defaults to the voice store. Tests inject their own
   * instead of reaching into the store; the client never guards these
   * calls, so a sink that throws is a bug that surfaces.
   */
  uiSink?: VoiceUiSink;
}
