/**
 * The mirror between a running VoiceClient and the room's state: every
 * event the room hands the client, the cancelled guard that keeps a late
 * event off an unmounted room, and the hydration from a client the room
 * attaches to mid-call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStore } from '@/store/voice';
import type { VoiceClient } from '@/services/voice/client';
import {
  hydrateFromClient, makeRoomEvents, resetRoomState, NO_LOCAL, NO_LOCAL_VIDEO, type LocalVideoTracks,
} from '@/components/voice/room/room-events';

function sinks() {
  return {
    setParticipants: vi.fn(),
    setRemoteTracks: vi.fn(),
    setPeerConnectionStates: vi.fn(),
    setLocal: vi.fn(),
    setLocalVideo: vi.fn(),
  };
}

const noVideo = () => NO_LOCAL_VIDEO;

/** Applies the last functional update handed to `setLocalVideo` to `prev`. */
function lastVideoUpdate(setLocalVideo: ReturnType<typeof vi.fn>, prev: LocalVideoTracks): LocalVideoTracks {
  const arg = setLocalVideo.mock.calls.at(-1)![0] as LocalVideoTracks | ((p: LocalVideoTracks) => LocalVideoTracks);
  return typeof arg === 'function' ? arg(prev) : arg;
}

beforeEach(() => {
  useVoiceStore.getState().leaveVoice();
});

describe('makeRoomEvents', () => {
  it('mirrors local track flags into the room and the store', () => {
    const s = sinks();
    const ev = makeRoomEvents({ ...s, expectSfu: false, setSfuStatus: vi.fn(), bumpRepublish: vi.fn(), setError: vi.fn(), isCancelled: () => false, readLocalVideo: noVideo });
    ev.onLocalTracksChange?.({ mic: true, camera: false, screen: true });
    expect(s.setLocal).toHaveBeenCalledWith({ mic: true, camera: false, screen: true });
    expect(useVoiceStore.getState()).toMatchObject({ isMuted: false, isCameraOn: false, isScreenSharing: true });
  });

  it('hands the room the camera track, and keeps the same object while the tracks are unchanged', () => {
    const s = sinks();
    const camera = {} as MediaStreamTrack;
    const ev = makeRoomEvents({
      ...s, expectSfu: false, setSfuStatus: vi.fn(), bumpRepublish: vi.fn(), setError: vi.fn(),
      isCancelled: () => false, readLocalVideo: () => ({ camera, screen: null }),
    });
    ev.onLocalTracksChange?.({ mic: false, camera: true, screen: false });
    const first = lastVideoUpdate(s.setLocalVideo, NO_LOCAL_VIDEO);
    expect(first).toEqual({ camera, screen: null });
    // A mic toggle reports the same camera track: the previous object survives,
    // so the room's MediaStream (and the preview bound to it) is not rebuilt.
    ev.onLocalTracksChange?.({ mic: true, camera: true, screen: false });
    expect(lastVideoUpdate(s.setLocalVideo, first)).toBe(first);
  });

  it('ignores every event once the owning effect is cancelled', () => {
    const s = sinks();
    const setError = vi.fn();
    const ev = makeRoomEvents({ ...s, expectSfu: true, setSfuStatus: vi.fn(), bumpRepublish: vi.fn(), setError, isCancelled: () => true, readLocalVideo: noVideo });
    ev.onParticipantsChange?.(['x']);
    ev.onRemoteTracksChange?.([]);
    ev.onPeerConnectionStatesChange?.({});
    ev.onLocalTracksChange?.({ mic: true, camera: true, screen: true });
    ev.onTopologyChange?.('f'.repeat(64));
    ev.onError?.('late');
    expect(s.setParticipants).not.toHaveBeenCalled();
    expect(s.setLocal).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().isMuted).toBe(true);
  });

  it('a connected SFU clears the stale error; a drop after connected asks for a republish', () => {
    const setSfuStatus = vi.fn();
    const bumpRepublish = vi.fn();
    const setError = vi.fn();
    useVoiceStore.getState().setError('Could not connect to the SFU');
    const ev = makeRoomEvents({ ...sinks(), expectSfu: true, setSfuStatus, bumpRepublish, setError, isCancelled: () => false, readLocalVideo: noVideo });
    ev.onTopologyChange?.('f'.repeat(64));
    expect(setSfuStatus).toHaveBeenCalledWith('connected');
    expect(setError).toHaveBeenCalledWith(null);
    expect(useVoiceStore.getState().error).toBeNull();
    ev.onTopologyChange?.(null);
    expect(bumpRepublish).toHaveBeenCalledTimes(1);
    const updater = setSfuStatus.mock.calls.at(-1)![0] as (prev: string) => string;
    expect(updater('connected')).toBe('starting');
    expect(updater('unavailable')).toBe('unavailable');
  });

  it('a mesh channel ignores topology events', () => {
    const setSfuStatus = vi.fn();
    const ev = makeRoomEvents({ ...sinks(), expectSfu: false, setSfuStatus, bumpRepublish: vi.fn(), setError: vi.fn(), isCancelled: () => false, readLocalVideo: noVideo });
    ev.onTopologyChange?.('f'.repeat(64));
    expect(setSfuStatus).not.toHaveBeenCalled();
  });

  it('errors reach both the room and the store', () => {
    const setError = vi.fn();
    const ev = makeRoomEvents({ ...sinks(), expectSfu: false, setSfuStatus: vi.fn(), bumpRepublish: vi.fn(), setError, isCancelled: () => false, readLocalVideo: noVideo });
    ev.onError?.('mic denied');
    expect(setError).toHaveBeenCalledWith('mic denied');
    expect(useVoiceStore.getState().error).toBe('mic denied');
  });
});

describe('hydrateFromClient and resetRoomState', () => {
  it('snapshots a running client into the room and the store', () => {
    const s = sinks();
    const client = {
      getParticipants: () => ['p1'],
      getRemoteTracks: () => [],
      getPeerConnectionStates: () => ({ p1: 'connected' }),
      getLocalTracks: () => ({ mic: {}, camera: null, screen: {} }),
    } as unknown as VoiceClient;
    hydrateFromClient(client, s);
    expect(s.setParticipants).toHaveBeenCalledWith(['p1']);
    expect(s.setPeerConnectionStates).toHaveBeenCalledWith({ p1: 'connected' });
    expect(s.setLocal).toHaveBeenCalledWith({ mic: true, camera: false, screen: true });
    expect(lastVideoUpdate(s.setLocalVideo, NO_LOCAL_VIDEO)).toEqual({ camera: null, screen: {} });
    expect(useVoiceStore.getState()).toMatchObject({ isMuted: false, isScreenSharing: true });
    resetRoomState(s);
    expect(s.setParticipants).toHaveBeenLastCalledWith([]);
    expect(s.setLocal).toHaveBeenLastCalledWith(NO_LOCAL);
    expect(s.setLocalVideo).toHaveBeenLastCalledWith(NO_LOCAL_VIDEO);
  });
});
