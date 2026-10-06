/**
 * How a joined room decides what goes where: which participants render as
 * video tiles and which as audio chips, who is sharing a screen, what (if
 * anything) takes the stage, and how many mesh peers are still connecting.
 *
 * Pure functions over the room's state so the layout rules can be tested
 * without React. `VoiceRoom` calls them from memos.
 */
import type { RemoteTrack } from '@/services/voice/client';

export interface TrackSlot {
  audio?: RemoteTrack;
  camera?: RemoteTrack;
  screen?: RemoteTrack;
  screenAudio?: RemoteTrack;
}

export type TracksByPubkey = Map<string, TrackSlot>;

export interface ScreenSharer {
  pubkey: string;
  /** The remote screen track, or null for the local share. */
  track: RemoteTrack | null;
  isLocal: boolean;
}

export interface ActiveStage {
  pubkey: string;
  isLocal: boolean;
  kind: 'screen' | 'camera';
  videoStream: MediaStream | null;
}

/** Index remote tracks by their origin pubkey, one slot per kind. */
export function groupTracksByPubkey(remoteTracks: readonly RemoteTrack[]): TracksByPubkey {
  const m: TracksByPubkey = new Map();
  for (const t of remoteTracks) {
    const slot = m.get(t.pubkey) ?? {};
    if (t.kind === 'audio') slot.audio = t;
    else if (t.kind === 'camera') slot.camera = t;
    else if (t.kind === 'screen') slot.screen = t;
    else if (t.kind === 'screen-audio') slot.screenAudio = t;
    m.set(t.pubkey, slot);
  }
  return m;
}

/**
 * Self first, then every participant in roster order: camera senders go to
 * the video grid, everyone else to the audio strip.
 */
export function splitParticipants(args: {
  selfPubkey: string;
  participants: readonly string[];
  localCamera: boolean;
  tracks: TracksByPubkey;
}): { videoPubkeys: string[]; audioPubkeys: string[] } {
  const videoPubkeys: string[] = [];
  const audioPubkeys: string[] = [];
  if (args.localCamera) videoPubkeys.push(args.selfPubkey);
  else audioPubkeys.push(args.selfPubkey);
  for (const pk of args.participants) {
    if (args.tracks.get(pk)?.camera) videoPubkeys.push(pk);
    else audioPubkeys.push(pk);
  }
  return { videoPubkeys, audioPubkeys };
}

/** The local share first (when live), then remote sharers in roster order. */
export function listScreenSharers(args: {
  selfPubkey: string;
  participants: readonly string[];
  localScreen: boolean;
  tracks: TracksByPubkey;
}): ScreenSharer[] {
  const sharers: ScreenSharer[] = [];
  if (args.localScreen) sharers.push({ pubkey: args.selfPubkey, track: null, isLocal: true });
  for (const pk of args.participants) {
    const s = args.tracks.get(pk)?.screen;
    if (s) sharers.push({ pubkey: pk, track: s, isLocal: false });
  }
  return sharers;
}

/**
 * Resolve the stage:
 *   - If the user pinned someone, show their screen (preferred) or camera.
 *   - Else, if anyone is screen-sharing, default to the first sharer.
 *   - Else no stage: grid mode.
 */
export function resolveStage(args: {
  pinned: string | null;
  screenSharers: readonly ScreenSharer[];
  tracks: TracksByPubkey;
  selfPubkey: string;
  localCamStream: MediaStream | null;
  localScreenStream: MediaStream | null;
}): ActiveStage | null {
  const { pinned, screenSharers, tracks, selfPubkey, localCamStream, localScreenStream } = args;
  const build = (pk: string): ActiveStage | null => {
    const isLocal = pk === selfPubkey;
    const slot = tracks.get(pk);
    const hasScreen = isLocal ? !!localScreenStream : !!slot?.screen;
    if (hasScreen) {
      return {
        pubkey: pk,
        isLocal,
        kind: 'screen',
        videoStream: isLocal ? localScreenStream : (slot?.screen?.stream ?? null),
      };
    }
    const hasCam = isLocal ? !!localCamStream : !!slot?.camera;
    if (hasCam) {
      return {
        pubkey: pk,
        isLocal,
        kind: 'camera',
        videoStream: isLocal ? localCamStream : (slot?.camera?.stream ?? null),
      };
    }
    return null;
  };

  if (pinned) {
    const s = build(pinned);
    if (s) return s;
  }
  if (screenSharers.length > 0) {
    const first = screenSharers[0];
    return {
      pubkey: first.pubkey,
      isLocal: first.isLocal,
      kind: 'screen',
      videoStream: first.isLocal ? localScreenStream : (first.track?.stream ?? null),
    };
  }
  return null;
}

/** Mesh peers whose connection is not yet `connected`; always 0 on an SFU. */
export function countMeshSyncing(args: {
  joined: boolean;
  expectSfu: boolean;
  participants: readonly string[];
  peerConnectionStates: Readonly<Record<string, RTCPeerConnectionState>>;
}): number {
  if (!args.joined || args.expectSfu) return 0;
  let count = 0;
  for (const pk of args.participants) {
    if (args.peerConnectionStates[pk] !== 'connected') count += 1;
  }
  return count;
}
