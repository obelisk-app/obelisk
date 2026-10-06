import { describe, expect, it } from 'vitest';
import type { RemoteTrack } from '@/services/voice/client';
import {
  countMeshSyncing,
  groupTracksByPubkey,
  listScreenSharers,
  resolveStage,
  splitParticipants,
} from '@/components/voice/room/stage-layout';

const ME = 'me';
const A = 'a';
const B = 'b';

let seq = 0;
function remote(pubkey: string, kind: RemoteTrack['kind']): RemoteTrack {
  return { pubkey, viaPubkey: pubkey, trackId: `t${++seq}`, kind, stream: { id: `s${seq}` } as unknown as MediaStream };
}
const stream = (id: string) => ({ id }) as unknown as MediaStream;

describe('groupTracksByPubkey', () => {
  it('files each kind into its slot under the origin pubkey', () => {
    const cam = remote(A, 'camera');
    const scr = remote(A, 'screen');
    const scrAudio = remote(A, 'screen-audio');
    const aud = remote(B, 'audio');
    const m = groupTracksByPubkey([cam, scr, scrAudio, aud]);
    expect(m.get(A)).toEqual({ camera: cam, screen: scr, screenAudio: scrAudio });
    expect(m.get(B)).toEqual({ audio: aud });
  });
});

describe('splitParticipants', () => {
  it('puts self first and camera senders in the grid', () => {
    const tracks = groupTracksByPubkey([remote(B, 'camera')]);
    expect(splitParticipants({ selfPubkey: ME, participants: [A, B], localCamera: false, tracks }))
      .toEqual({ videoPubkeys: [B], audioPubkeys: [ME, A] });
    expect(splitParticipants({ selfPubkey: ME, participants: [A, B], localCamera: true, tracks }))
      .toEqual({ videoPubkeys: [ME, B], audioPubkeys: [A] });
  });
});

describe('listScreenSharers', () => {
  it('lists the local share first, then remote sharers in roster order', () => {
    const scr = remote(B, 'screen');
    const tracks = groupTracksByPubkey([scr, remote(A, 'camera')]);
    expect(listScreenSharers({ selfPubkey: ME, participants: [A, B], localScreen: true, tracks }))
      .toEqual([{ pubkey: ME, track: null, isLocal: true }, { pubkey: B, track: scr, isLocal: false }]);
    expect(listScreenSharers({ selfPubkey: ME, participants: [A, B], localScreen: false, tracks }))
      .toEqual([{ pubkey: B, track: scr, isLocal: false }]);
  });
});

describe('resolveStage', () => {
  const base = { selfPubkey: ME, localCamStream: null, localScreenStream: null };

  it('is null when nobody is pinned and nobody shares a screen', () => {
    const tracks = groupTracksByPubkey([remote(A, 'camera')]);
    expect(resolveStage({ ...base, pinned: null, screenSharers: [], tracks })).toBeNull();
  });

  it('defaults to the first screen sharer', () => {
    const scr = remote(B, 'screen');
    const tracks = groupTracksByPubkey([scr]);
    const sharers = listScreenSharers({ selfPubkey: ME, participants: [B], localScreen: false, tracks });
    expect(resolveStage({ ...base, pinned: null, screenSharers: sharers, tracks }))
      .toEqual({ pubkey: B, isLocal: false, kind: 'screen', videoStream: scr.stream });
  });

  it('a pinned camera beats a screen sharer', () => {
    const cam = remote(A, 'camera');
    const scr = remote(B, 'screen');
    const tracks = groupTracksByPubkey([cam, scr]);
    const sharers = listScreenSharers({ selfPubkey: ME, participants: [A, B], localScreen: false, tracks });
    expect(resolveStage({ ...base, pinned: A, screenSharers: sharers, tracks }))
      .toEqual({ pubkey: A, isLocal: false, kind: 'camera', videoStream: cam.stream });
  });

  it('prefers the pinned person\'s screen over their camera', () => {
    const cam = remote(A, 'camera');
    const scr = remote(A, 'screen');
    const tracks = groupTracksByPubkey([cam, scr]);
    expect(resolveStage({ ...base, pinned: A, screenSharers: [], tracks }))
      .toEqual({ pubkey: A, isLocal: false, kind: 'screen', videoStream: scr.stream });
  });

  it('falls through to the first sharer when the pinned person has no video', () => {
    const scr = remote(B, 'screen');
    const tracks = groupTracksByPubkey([remote(A, 'audio'), scr]);
    const sharers = listScreenSharers({ selfPubkey: ME, participants: [A, B], localScreen: false, tracks });
    expect(resolveStage({ ...base, pinned: A, screenSharers: sharers, tracks })?.pubkey).toBe(B);
  });

  it('uses the local streams for self', () => {
    const cam = stream('local-cam');
    const scr = stream('local-screen');
    const tracks = groupTracksByPubkey([]);
    expect(resolveStage({ ...base, pinned: ME, screenSharers: [], tracks, localCamStream: cam, localScreenStream: null }))
      .toEqual({ pubkey: ME, isLocal: true, kind: 'camera', videoStream: cam });
    const sharers = listScreenSharers({ selfPubkey: ME, participants: [], localScreen: true, tracks });
    expect(resolveStage({ ...base, pinned: null, screenSharers: sharers, tracks, localCamStream: cam, localScreenStream: scr }))
      .toEqual({ pubkey: ME, isLocal: true, kind: 'screen', videoStream: scr });
  });
});

describe('countMeshSyncing', () => {
  it('counts participants whose peer connection is not connected, only on mesh while joined', () => {
    const peerConnectionStates: Record<string, RTCPeerConnectionState> = { [A]: 'connected', [B]: 'connecting' };
    expect(countMeshSyncing({ joined: true, expectSfu: false, participants: [A, B], peerConnectionStates })).toBe(1);
    expect(countMeshSyncing({ joined: true, expectSfu: false, participants: [A, B, 'c'], peerConnectionStates })).toBe(2);
    expect(countMeshSyncing({ joined: true, expectSfu: true, participants: [A, B], peerConnectionStates })).toBe(0);
    expect(countMeshSyncing({ joined: false, expectSfu: false, participants: [A, B], peerConnectionStates })).toBe(0);
  });
});
