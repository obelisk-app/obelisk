import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted moves this to the top of the compiled module so it's available
// inside the vi.mock factory (which is itself hoisted above any imports).
const hoisted = vi.hoisted(() => {
  const roomInstances: any[] = [];
  class FakeRoom {
    handlers = new Map<string, Array<(...args: any[]) => void>>();
    localParticipant: any;
    remoteParticipants = new Map<string, any>();
    connect: any;
    disconnect: any;
    constructor() {
      this.localParticipant = {
        identity: 'self',
        setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
        setCameraEnabled: vi.fn().mockResolvedValue(undefined),
        publishTrack: vi.fn().mockResolvedValue(undefined),
        unpublishTrack: vi.fn().mockResolvedValue(undefined),
        getTrackPublication: vi.fn(() => ({
          mute: vi.fn().mockResolvedValue(undefined),
          unmute: vi.fn().mockResolvedValue(undefined),
          track: { mediaStreamTrack: { kind: 'audio' } },
        })),
        trackPublications: new Map(),
      };
      this.connect = vi.fn().mockResolvedValue(undefined);
      this.disconnect = vi.fn().mockResolvedValue(undefined);
      roomInstances.push(this);
    }
    on(event: string, handler: (...args: any[]) => void) {
      if (!this.handlers.has(event)) this.handlers.set(event, []);
      this.handlers.get(event)!.push(handler);
      return this;
    }
    emit(event: string, ...args: any[]) {
      for (const h of this.handlers.get(event) || []) h(...args);
    }
  }
  return { FakeRoom, roomInstances };
});

const { FakeRoom, roomInstances } = hoisted;

vi.mock('livekit-client', () => {
  return {
    Room: hoisted.FakeRoom,
    RoomEvent: {
      ConnectionStateChanged: 'ConnectionStateChanged',
      Disconnected: 'Disconnected',
      ActiveSpeakersChanged: 'ActiveSpeakersChanged',
      TrackSubscribed: 'TrackSubscribed',
      TrackUnsubscribed: 'TrackUnsubscribed',
      ParticipantDisconnected: 'ParticipantDisconnected',
    },
    Track: {
      Kind: { Audio: 'audio', Video: 'video' },
      Source: {
        Camera: 'camera',
        Microphone: 'microphone',
        ScreenShare: 'screen_share',
        ScreenShareAudio: 'screen_share_audio',
      },
    },
    VideoPresets: {
      h540: { resolution: { width: 960, height: 540 } },
      h720: { resolution: { width: 1280, height: 720 } },
      h1080: { resolution: { width: 1920, height: 1080 } },
      h1440: { resolution: { width: 2560, height: 1440 } },
    },
    createLocalScreenTracks: vi.fn().mockResolvedValue([]),
  };
});

import { LiveKitVoiceClient } from './livekit-voice';

describe('LiveKitVoiceClient', () => {
  beforeEach(() => {
    roomInstances.length = 0;
  });

  it('fetches a token and connects on join', async () => {
    const tokenFetcher = vi.fn().mockResolvedValue({ url: 'ws://test', token: 'jwt' });
    const client = new LiveKitVoiceClient({ tokenFetcher });
    await client.join('ch1');
    expect(tokenFetcher).toHaveBeenCalledWith('ch1');
    expect(roomInstances).toHaveLength(1);
    expect(roomInstances[0].connect).toHaveBeenCalledWith('ws://test', 'jwt');
  });

  it('emits onSpeakingChange transitions from ActiveSpeakersChanged diffs', async () => {
    const tokenFetcher = vi.fn().mockResolvedValue({ url: 'ws://test', token: 'jwt' });
    const client = new LiveKitVoiceClient({ tokenFetcher });
    const events: Array<[string, boolean]> = [];
    client.onSpeakingChange = (pk, s) => events.push([pk, s]);
    await client.join('ch1');
    const room = roomInstances[0];

    room.emit('ActiveSpeakersChanged', [{ identity: 'alice' }]);
    room.emit('ActiveSpeakersChanged', [{ identity: 'alice' }, { identity: 'bob' }]);
    room.emit('ActiveSpeakersChanged', [{ identity: 'bob' }]);
    room.emit('ActiveSpeakersChanged', []);

    expect(events).toEqual([
      ['alice', true],
      ['bob', true],
      ['alice', false],
      ['bob', false],
    ]);
  });

  it('setPeerMuted zeroes that participant volume', async () => {
    const tokenFetcher = vi.fn().mockResolvedValue({ url: 'ws://test', token: 'jwt' });
    const client = new LiveKitVoiceClient({ tokenFetcher });
    await client.join('ch1');
    const room = roomInstances[0];
    const setVolume = vi.fn();
    room.remoteParticipants.set('bob', { identity: 'bob', setVolume });

    client.setPeerMuted('bob', true);
    expect(setVolume).toHaveBeenCalledWith(0);
    client.setPeerMuted('bob', false);
    expect(setVolume).toHaveBeenLastCalledWith(1);
  });

  it('setDeafened zeroes every remote participant volume', async () => {
    const tokenFetcher = vi.fn().mockResolvedValue({ url: 'ws://test', token: 'jwt' });
    const client = new LiveKitVoiceClient({ tokenFetcher });
    await client.join('ch1');
    const room = roomInstances[0];
    const aliceVol = vi.fn();
    const bobVol = vi.fn();
    room.remoteParticipants.set('alice', { identity: 'alice', setVolume: aliceVol });
    room.remoteParticipants.set('bob', { identity: 'bob', setVolume: bobVol });

    client.setDeafened(true);
    expect(aliceVol).toHaveBeenCalledWith(0);
    expect(bobVol).toHaveBeenCalledWith(0);
  });

  it('leave disconnects the room', async () => {
    const tokenFetcher = vi.fn().mockResolvedValue({ url: 'ws://test', token: 'jwt' });
    const client = new LiveKitVoiceClient({ tokenFetcher });
    await client.join('ch1');
    const room = roomInstances[0];
    await client.leave();
    expect(room.disconnect).toHaveBeenCalled();
  });

  it('onError fires and rethrows when token fetch fails', async () => {
    const tokenFetcher = vi.fn().mockRejectedValue(new Error('no server'));
    const client = new LiveKitVoiceClient({ tokenFetcher });
    const onError = vi.fn();
    client.onError = onError;
    await expect(client.join('ch1')).rejects.toThrow('no server');
    expect(onError).toHaveBeenCalled();
  });
});
