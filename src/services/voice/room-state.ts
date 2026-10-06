/**
 * The state of one voice room that both topologies write.
 *
 * A mesh `Peer` and the `SfuClient` both deliver remote tracks, both report
 * who is connected, both decide the renderable roster, and both start and
 * stop speaking detectors. Before this module each of those lived as a
 * private field on `VoiceClient`, mutated from `openPeer`'s event wiring,
 * from `tearDownPeer`, from the SFU client's events and from the remote
 * closure handler, so the two topologies could not be moved out of the
 * client without one of them reaching into the other. `RoomState` is that
 * shared surface, made explicit: the mesh session, the SFU session and the
 * local-media controller each hold a reference and go through its methods,
 * and the UI-facing emits happen in exactly one place.
 *
 * It owns no topology: nothing here subscribes, dials, publishes or decides
 * whether the room is on mesh or on an SFU.
 */
import type { Peer } from './peer';
import { SpeakingDetector } from './speaking-detector';
import type { VoiceUiSink } from './ui-sink';
import type { VoiceTrackKind } from './types';

export interface RemoteTrack {
  /**
   * Logical origin: whose participant tile this track renders in. In
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
  onPeerConnectionStatesChange?(states: Record<string, RTCPeerConnectionState>): void;
  /**
   * Topology change: null means "back on mesh", a hex pubkey means "now
   * forwarding through this SFU". Fires when `enterSfuMode` has a working
   * `SfuClient` (never earlier: the badge must not say "connected" during
   * the RPC handshake), when `failSfuStart`, `exitSfuMode` or a remote
   * closure drop it. The beacon roster never flips the topology; `pickSfu`
   * at join, `setExpectSfu` and `scheduleSfuRejoin` do. UI uses this to
   * tell users whether their `voice-sfu` channel actually reached the SFU.
   */
  onTopologyChange?(sfuPubkey: string | null): void;
  onError?(message: string): void;
  onLeft?(reason?: string): void;
}

function isAudioKind(kind: VoiceTrackKind): boolean {
  return kind === 'audio' || kind === 'screen-audio';
}

export class RoomState {
  /** Live mesh peers by remote pubkey. The SFU peer is never in here. */
  readonly peers = new Map<string, Peer>();
  /** Every remote track currently rendered, by track id. */
  readonly remoteTracks = new Map<string, RemoteTrack>();
  /**
   * Pubkeys we currently have an RTC connection in `connected` state with
   * (mesh peers, or the SFU). Drives the `connectedTo` field of our own
   * beacon: every other peer who sees our beacon learns to dial these
   * pubkeys, even if those pubkeys' own beacons were dropped by the relay.
   */
  readonly connectedPubkeys = new Set<string>();
  /** The renderable participant list, minus self. */
  rosterPubkeys: string[] = [];
  /** Receive-side mute: every remote audio track disabled, publish untouched. */
  deafened = false;
  /**
   * The React owner's listeners. Swapped by `VoiceClient.setEvents` when a
   * fresh room component picks up a running call, so read on every emit,
   * never captured.
   */
  events: VoiceClientEvents;
  /**
   * Speaking-activity detectors keyed by pubkey: the local detector lives
   * under `selfPubkey`, each remote audio track's under its origin pubkey.
   * Kept addressable so mute toggles, peer teardown and remote-track-end
   * can all stop the right one.
   */
  private readonly speakingDetectors = new Map<string, SpeakingDetector>();
  /**
   * Multicast subscribers for remote-track changes, beside the single
   * `events.onRemoteTracksChange`. Surfaces outside the room (the
   * always-mounted `BackgroundVoiceAudio` sink) register here so they do
   * not fight the room component for `events`.
   */
  private readonly remoteTracksListeners = new Set<(t: RemoteTrack[]) => void>();

  constructor(
    readonly selfPubkey: string,
    readonly ui: VoiceUiSink,
    events: VoiceClientEvents,
  ) {
    this.events = events;
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  getRemoteTracks(): RemoteTrack[] {
    return Array.from(this.remoteTracks.values());
  }

  getPeerConnectionStates(): Record<string, RTCPeerConnectionState> {
    const states: Record<string, RTCPeerConnectionState> = {};
    for (const [pubkey, peer] of this.peers.entries()) {
      states[pubkey] = peer.pc.connectionState;
    }
    return states;
  }

  // ── Emits ──────────────────────────────────────────────────────────────

  subscribeRemoteTracks(cb: (t: RemoteTrack[]) => void): () => void {
    this.remoteTracksListeners.add(cb);
    try { cb(this.getRemoteTracks()); } catch (err) {
      // A listener that throws must not take the others down, but it is a
      // bug in that listener (the background audio sink never binds).
      console.warn('[voice] remote-tracks listener threw on subscribe', err);
    }
    return () => { this.remoteTracksListeners.delete(cb); };
  }

  emitRemoteTracks(): void {
    const arr = this.getRemoteTracks();
    this.events.onRemoteTracksChange?.(arr);
    for (const cb of this.remoteTracksListeners) {
      try { cb(arr); } catch (err) {
        console.warn('[voice] remote-tracks listener threw', err);
      }
    }
  }

  emitPeerConnectionStates(): void {
    this.events.onPeerConnectionStatesChange?.(this.getPeerConnectionStates());
  }

  /** Replace the renderable roster and tell the owner. */
  setRoster(pubkeys: readonly string[]): void {
    this.rosterPubkeys = [...pubkeys];
    this.events.onParticipantsChange?.([...this.rosterPubkeys]);
  }

  // ── Remote tracks ──────────────────────────────────────────────────────

  /**
   * A remote track arrived. `receiveTrack` is the track the deafen flag
   * applies to (the RTC track in mesh, the mediasoup consumer's track on
   * the SFU); it is disabled on arrival when the listener is deafened so a
   * peer who joins after we deafened does not suddenly become audible.
   * Audio tracks get a speaking detector keyed by the origin pubkey, so
   * SFU mode lights up the right tile and not "the SFU is speaking".
   */
  addRemoteTrack(entry: RemoteTrack, receiveTrack: MediaStreamTrack): void {
    if (this.deafened && isAudioKind(entry.kind)) receiveTrack.enabled = false;
    this.remoteTracks.set(entry.trackId, entry);
    if (entry.kind === 'audio') this.attachSpeakingDetector(entry.pubkey, entry.stream);
    this.emitRemoteTracks();
  }

  /** A remote track ended. Its speaking detector stops with it. */
  endRemoteTrack(trackId: string): void {
    const removed = this.remoteTracks.get(trackId);
    this.remoteTracks.delete(trackId);
    if (removed?.kind === 'audio') this.detachSpeakingDetector(removed.pubkey);
    this.emitRemoteTracks();
  }

  /**
   * Drop every track delivered over `viaPubkey`'s connection. When the
   * SFU's PC drops, every forwarded track must clear regardless of which
   * origin it carried; in mesh `viaPubkey === pubkey` so nothing changes.
   */
  removeRemoteTracksFor(viaPubkey: string): void {
    let changed = false;
    const droppedAudioOrigins = new Set<string>();
    for (const [id, t] of Array.from(this.remoteTracks.entries())) {
      if (t.viaPubkey !== viaPubkey) continue;
      this.remoteTracks.delete(id);
      if (t.kind === 'audio') droppedAudioOrigins.add(t.pubkey);
      changed = true;
    }
    for (const origin of droppedAudioOrigins) this.detachSpeakingDetector(origin);
    if (changed) this.emitRemoteTracks();
  }

  setDeafened(on: boolean): void {
    this.deafened = on;
    for (const t of this.remoteTracks.values()) {
      if (!isAudioKind(t.kind)) continue;
      for (const track of t.stream.getAudioTracks()) track.enabled = !on;
    }
  }

  // ── Speaking detection ─────────────────────────────────────────────────

  attachSpeakingDetector(pubkey: string, stream: MediaStream): void {
    this.detachSpeakingDetector(pubkey);
    let detector: SpeakingDetector;
    try {
      detector = new SpeakingDetector(stream, (speaking) => {
        this.ui.setSpeaking(pubkey, speaking);
      });
    } catch (e) {
      // jsdom and a handful of older Safari builds don't expose AudioContext.
      // The call is voice-first, so we degrade (no speaking orb) rather
      // than tearing down the call, and say so.
      console.warn('[voice] speaking detector unavailable:', e);
      return;
    }
    this.speakingDetectors.set(pubkey, detector);
    detector.start();
  }

  detachSpeakingDetector(pubkey: string): void {
    const det = this.speakingDetectors.get(pubkey);
    if (!det) return;
    det.stop();
    this.speakingDetectors.delete(pubkey);
    this.ui.setSpeaking(pubkey, false);
  }

  // ── Leave ──────────────────────────────────────────────────────────────

  /**
   * Forget everything remote. Peers are closed by the mesh session before
   * this runs (closing them is a topology concern); here the map is only
   * emptied. Every speaking orb goes dark through the sink.
   */
  reset(): void {
    this.peers.clear();
    this.rosterPubkeys = [];
    this.connectedPubkeys.clear();
    this.remoteTracks.clear();
    this.emitRemoteTracks();
    for (const [pk, det] of this.speakingDetectors) {
      det.stop();
      this.ui.setSpeaking(pk, false);
    }
    this.speakingDetectors.clear();
  }
}
