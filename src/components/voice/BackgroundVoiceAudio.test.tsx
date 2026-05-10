/**
 * BackgroundVoiceAudio is the always-mounted hidden audio sink that keeps
 * remote-peer audio playing while the user navigates away from the voice
 * room. The voice-room tile components used to own the `<audio>`
 * elements, which meant unmounting them killed audio output mid-call.
 *
 * Coverage:
 *   - renders nothing while there is no active call
 *   - renders one `<audio>` per remote audio + screen-audio track of the
 *     active client and binds `srcObject` to the underlying MediaStream
 *   - skips video-only tracks (camera / screen)
 *   - reflects `localMutedPubkeys` and `isDeafened` on each element's
 *     `muted` attribute so per-peer mute / global deafen still apply
 *     when the bar is the only audio surface
 *   - drops elements when `setActiveVoiceClient(null)` (call ended)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import BackgroundVoiceAudio from './BackgroundVoiceAudio';
import { setActiveVoiceClient } from '@/lib/voice/active-client';
import { useVoiceStore } from '@/store/voice';
import type { RemoteTrack, VoiceClient } from '@/lib/voice/client';

type TrackChangeCb = (t: RemoteTrack[]) => void;

function makeFakeClient() {
  const listeners = new Set<TrackChangeCb>();
  let current: RemoteTrack[] = [];
  const fake = {
    channelId: 'group-1',
    isJoined: () => true,
    subscribeRemoteTracks(cb: TrackChangeCb): () => void {
      listeners.add(cb);
      cb(current);
      return () => { listeners.delete(cb); };
    },
    setTracks(next: RemoteTrack[]) {
      current = next;
      for (const cb of listeners) cb(next);
    },
  };
  return fake as unknown as VoiceClient & { setTracks: (t: RemoteTrack[]) => void };
}

// jsdom doesn't ship a MediaStream constructor; for these tests we only need
// a stable object identity to assert against `audioRef.srcObject`.
function makeFakeStream(): MediaStream {
  return { id: Math.random().toString(36).slice(2) } as unknown as MediaStream;
}

function fakeAudioTrack(pubkey: string, kind: RemoteTrack['kind']): RemoteTrack {
  return {
    pubkey,
    viaPubkey: pubkey,
    trackId: `${pubkey}:${kind}`,
    kind,
    stream: makeFakeStream(),
  };
}

beforeEach(() => {
  setActiveVoiceClient(null);
  useVoiceStore.setState({
    localMutedPubkeys: {},
    isDeafened: false,
  });
});

afterEach(() => {
  cleanup();
  setActiveVoiceClient(null);
});

describe('BackgroundVoiceAudio', () => {
  it('renders no audio elements when there is no active call', () => {
    const { container } = render(<BackgroundVoiceAudio />);
    expect(container.querySelectorAll('audio')).toHaveLength(0);
  });

  it('renders one <audio> per audio + screen-audio track on the active client', () => {
    const client = makeFakeClient();
    setActiveVoiceClient(client);
    const { container } = render(<BackgroundVoiceAudio />);

    act(() => {
      client.setTracks([
        fakeAudioTrack('peer-a', 'audio'),
        fakeAudioTrack('peer-b', 'audio'),
        fakeAudioTrack('peer-b', 'screen-audio'),
        fakeAudioTrack('peer-c', 'camera'),     // video-only — skipped
        fakeAudioTrack('peer-c', 'screen'),     // video-only — skipped
      ]);
    });

    expect(container.querySelectorAll('audio')).toHaveLength(3);
  });

  it('binds srcObject to each track stream', () => {
    const client = makeFakeClient();
    setActiveVoiceClient(client);
    const { container } = render(<BackgroundVoiceAudio />);

    const trackA = fakeAudioTrack('peer-a', 'audio');
    act(() => { client.setTracks([trackA]); });

    const audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio).toBeTruthy();
    expect(audio.srcObject).toBe(trackA.stream);
  });

  it('honors per-pubkey local mute', () => {
    const client = makeFakeClient();
    setActiveVoiceClient(client);
    const { container } = render(<BackgroundVoiceAudio />);

    act(() => { client.setTracks([fakeAudioTrack('peer-a', 'audio')]); });
    let audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio.muted).toBe(false);

    act(() => {
      useVoiceStore.setState({ localMutedPubkeys: { 'peer-a': true } });
    });
    audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio.muted).toBe(true);
  });

  it('honors global deafen across all elements', () => {
    const client = makeFakeClient();
    setActiveVoiceClient(client);
    const { container } = render(<BackgroundVoiceAudio />);

    act(() => {
      client.setTracks([
        fakeAudioTrack('peer-a', 'audio'),
        fakeAudioTrack('peer-b', 'audio'),
      ]);
    });
    expect(container.querySelectorAll('audio')).toHaveLength(2);

    act(() => { useVoiceStore.setState({ isDeafened: true }); });
    const all = container.querySelectorAll('audio');
    for (const el of all) expect((el as HTMLAudioElement).muted).toBe(true);
  });

  it('clears all audio elements when the active client is unset', () => {
    const client = makeFakeClient();
    setActiveVoiceClient(client);
    const { container } = render(<BackgroundVoiceAudio />);
    act(() => { client.setTracks([fakeAudioTrack('peer-a', 'audio')]); });
    expect(container.querySelectorAll('audio')).toHaveLength(1);

    act(() => { setActiveVoiceClient(null); });
    expect(container.querySelectorAll('audio')).toHaveLength(0);
  });
});
