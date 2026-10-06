import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DmRemoteMedia } from '@/services/dm-call/remote-media';
import { FakeMediaStreamTrack, installWebRtcMocks } from '@tests/support/mocks/webrtc';

let handle: ReturnType<typeof installWebRtcMocks>;
beforeEach(() => { handle = installWebRtcMocks(); });
afterEach(() => handle.uninstall());

const track = (kind: 'audio' | 'video') => new FakeMediaStreamTrack(kind) as unknown as MediaStreamTrack;

describe('DmRemoteMedia', () => {
  it('plays the mic and a shared screen\'s audio through one stream', () => {
    const remote = new DmRemoteMedia();
    const mic = track('audio');
    const screenAudio = track('audio');
    remote.add(mic, 'audio');
    remote.add(screenAudio, 'screen-audio');
    expect(remote.snapshot().remoteAudio?.getTracks()).toEqual([mic, screenAudio]);
  });

  it('keeps the same audio stream object while its tracks are unchanged', () => {
    const remote = new DmRemoteMedia();
    remote.add(track('audio'), 'audio');
    const first = remote.snapshot().remoteAudio;
    remote.add(track('video'), 'camera');
    expect(remote.snapshot().remoteAudio).toBe(first);
    expect(remote.snapshot().remoteVideo).not.toBeNull();
  });

  it('reports no change for a track it never held, and clears on drop', () => {
    const remote = new DmRemoteMedia();
    const cam = track('video');
    remote.add(cam, 'camera');
    expect(remote.remove('not-ours')).toBe(false);
    expect(remote.remove(cam.id)).toBe(true);
    expect(remote.snapshot().remoteVideo).toBeNull();
    remote.add(track('audio'), 'audio');
    remote.clear();
    expect(remote.snapshot()).toEqual({ remoteAudio: null, remoteVideo: null, remoteScreen: null });
  });
});
