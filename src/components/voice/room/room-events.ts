/**
 * How a running `VoiceClient` is mirrored into the room's React state and
 * the voice store: the `VoiceClientEvents` the room hands the client, the
 * hydration of a client it attaches to mid-call, and the reset when the
 * call is gone. Pure functions over a bag of setters, so the effect in
 * `useVoiceRoomClient` only orchestrates.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { RemoteTrack, VoiceClient, VoiceClientEvents } from '@/services/voice/client';
import { useVoiceStore } from '@/store/voice';
import type { SfuStatus } from './header';

export interface LocalTrackFlags {
  mic: boolean;
  camera: boolean;
  screen: boolean;
}

export const NO_LOCAL: LocalTrackFlags = { mic: false, camera: false, screen: false };

/**
 * The local camera and screen tracks themselves, held in state so the room
 * can wrap each in a `MediaStream` keyed on the track. Reading them from the
 * client during render (what the room used to do) rebuilt both streams on
 * every flag change, so muting the mic re-bound the camera preview.
 */
export interface LocalVideoTracks {
  camera: MediaStreamTrack | null;
  screen: MediaStreamTrack | null;
}

export const NO_LOCAL_VIDEO: LocalVideoTracks = { camera: null, screen: null };

export interface RoomStateSinks {
  setParticipants: Dispatch<SetStateAction<string[]>>;
  setRemoteTracks: Dispatch<SetStateAction<RemoteTrack[]>>;
  setPeerConnectionStates: Dispatch<SetStateAction<Record<string, RTCPeerConnectionState>>>;
  setLocal: Dispatch<SetStateAction<LocalTrackFlags>>;
  setLocalVideo: Dispatch<SetStateAction<LocalVideoTracks>>;
}

/** Everything the room shows about a call, back to "no call". */
export function resetRoomState(sinks: RoomStateSinks): void {
  sinks.setParticipants([]);
  sinks.setRemoteTracks([]);
  sinks.setPeerConnectionStates({});
  sinks.setLocal(NO_LOCAL);
  sinks.setLocalVideo(NO_LOCAL_VIDEO);
}

/** Keeps the previous object while both tracks are the same, so nothing downstream re-binds. */
function sameTracksOr(next: LocalVideoTracks): SetStateAction<LocalVideoTracks> {
  return (prev) => (prev.camera === next.camera && prev.screen === next.screen ? prev : next);
}

/** Mirror local track flags to the room and to the store the status bar reads. */
function applyLocal(sinks: RoomStateSinks, l: LocalTrackFlags, video: LocalVideoTracks): void {
  sinks.setLocal(l);
  sinks.setLocalVideo(sameTracksOr(video));
  const s = useVoiceStore.getState();
  s.setMuted(!l.mic);
  s.setCameraOn(l.camera);
  s.setScreenSharing(l.screen);
}

/**
 * Snapshot a client the room is attaching to (navigating back into a live
 * call) so the UI does not wait for the next event tick.
 */
export function hydrateFromClient(client: VoiceClient, sinks: RoomStateSinks): void {
  sinks.setParticipants(client.getParticipants());
  sinks.setRemoteTracks(client.getRemoteTracks());
  sinks.setPeerConnectionStates(client.getPeerConnectionStates());
  const tracks = client.getLocalTracks();
  applyLocal(
    sinks,
    { mic: !!tracks.mic, camera: !!tracks.camera, screen: !!tracks.screen },
    { camera: tracks.camera, screen: tracks.screen },
  );
}

export interface RoomEventDeps extends RoomStateSinks {
  /** Only voice-sfu channels track SFU upgrade status. */
  expectSfu: boolean;
  setSfuStatus: Dispatch<SetStateAction<SfuStatus>>;
  /** The topology dropped back after a connected SFU; the supervisor republishes. */
  bumpRepublish: () => void;
  setError: (message: string | null) => void;
  /** The owning effect was cleaned up; late events must not touch state. */
  isCancelled: () => boolean;
  /** The running client's camera and screen tracks, read when its local tracks change. */
  readLocalVideo: () => LocalVideoTracks;
}

export function makeRoomEvents(deps: RoomEventDeps): VoiceClientEvents {
  const cancelled = deps.isCancelled;
  return {
    onParticipantsChange: (p) => { if (!cancelled()) deps.setParticipants(p); },
    onRemoteTracksChange: (t) => { if (!cancelled()) deps.setRemoteTracks(t); },
    onPeerConnectionStatesChange: (states) => {
      if (!cancelled()) deps.setPeerConnectionStates(states);
    },
    onLocalTracksChange: (l) => {
      if (cancelled()) return;
      applyLocal(deps, l, deps.readLocalVideo());
    },
    onTopologyChange: (sfu) => {
      if (cancelled()) return;
      // Only voice-sfu channels are tracking SFU upgrade status; for
      // a plain voice channel an SFU showing up wouldn't make sense
      // anyway, but keep the state machine local to that channel kind.
      if (!deps.expectSfu) return;
      if (sfu) {
        deps.setSfuStatus('connected');
        // Clear any stale connection error from a prior failed attempt.
        // If we got here, SfuClient.start resolved; the "rpc timeout"
        // / "Could not connect to the SFU" toast it produced is no
        // longer accurate, but nothing else clears it (the supervisor
        // retries silently and the user is left staring at a red
        // banner during a working call).
        deps.setError(null);
        useVoiceStore.getState().setError(null);
      } else {
        // Topology dropped back to mesh, most likely the SFU restarted
        // or its beacon expired. Trigger a republish so a transient
        // outage doesn't strand the channel on mesh until everyone
        // rejoins. The supervisor handles the actual publish (with
        // force=true to bypass the rate-limit).
        deps.setSfuStatus((prev) => (prev === 'connected' ? 'starting' : prev));
        deps.bumpRepublish();
      }
    },
    onError: (m) => {
      if (cancelled()) return;
      deps.setError(m);
      useVoiceStore.getState().setError(m);
    },
  };
}
