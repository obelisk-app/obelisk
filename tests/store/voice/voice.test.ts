import { describe, it, expect, beforeEach } from 'vitest';
import { useVoiceStore, VOICE_STORE_VERSION } from '@/store/voice';
import { CORRUPT_STATES, readBlob, seedBlob } from '../persist-blob';

describe('voice store quality slice', () => {
  beforeEach(() => {
    useVoiceStore.setState({ peerQuality: {}, videoQuality: 'auto', receivedVideoQuality: 'auto' });
  });

  it('defaults to auto for both directions', () => {
    expect(useVoiceStore.getState().videoQuality).toBe('auto');
    expect(useVoiceStore.getState().receivedVideoQuality).toBe('auto');
  });

  it('updates outbound + inbound quality independently', () => {
    useVoiceStore.getState().setVideoQuality('720p');
    useVoiceStore.getState().setReceivedVideoQuality('480p');
    expect(useVoiceStore.getState().videoQuality).toBe('720p');
    expect(useVoiceStore.getState().receivedVideoQuality).toBe('480p');
  });

  it('tracks per-peer quality samples and clears them', () => {
    useVoiceStore.getState().setPeerQuality('abc', {
      level: 'good',
      rttMs: 50,
      loss: 0,
      jitterMs: 10,
      outboundVideoBps: 1_000_000,
      outboundFps: 30,
      qualityLimitationReason: null,
    });
    expect(useVoiceStore.getState().peerQuality.abc.level).toBe('good');
    useVoiceStore.getState().clearPeerQuality('abc');
    expect(useVoiceStore.getState().peerQuality.abc).toBeUndefined();
  });

  it('leaveVoice resets per-peer quality and returns to listening-only mic state', () => {
    useVoiceStore.setState({ isMuted: false });
    useVoiceStore.getState().setPeerQuality('abc', {
      level: 'fair', rttMs: null, loss: null, jitterMs: null,
      outboundVideoBps: null, outboundFps: null, qualityLimitationReason: null,
    });
    useVoiceStore.getState().leaveVoice();
    expect(useVoiceStore.getState().peerQuality).toEqual({});
    expect(useVoiceStore.getState().isMuted).toBe(true);
  });
});

describe('voice store speaking + per-peer mute', () => {
  beforeEach(() => {
    useVoiceStore.setState({ speakingPubkeys: {}, localMutedPubkeys: {} });
  });

  it('flips speakingPubkeys idempotently', () => {
    const s = useVoiceStore.getState();
    s.setSpeaking('alice', true);
    expect(useVoiceStore.getState().speakingPubkeys.alice).toBe(true);
    // Re-asserting true returns the same object reference (no churn).
    const before = useVoiceStore.getState().speakingPubkeys;
    s.setSpeaking('alice', true);
    expect(useVoiceStore.getState().speakingPubkeys).toBe(before);
    s.setSpeaking('alice', false);
    expect(useVoiceStore.getState().speakingPubkeys.alice).toBeUndefined();
  });

  it('mutes and unmutes individual peers', () => {
    const s = useVoiceStore.getState();
    s.muteLocally('alice');
    s.muteLocally('bob');
    expect(Object.keys(useVoiceStore.getState().localMutedPubkeys).sort()).toEqual(['alice', 'bob']);
    s.unmuteLocally('alice');
    expect(useVoiceStore.getState().localMutedPubkeys.alice).toBeUndefined();
    expect(useVoiceStore.getState().localMutedPubkeys.bob).toBe(true);
  });

  it('clearLocalMutes empties the set in one call', () => {
    const s = useVoiceStore.getState();
    s.muteLocally('a');
    s.muteLocally('b');
    s.clearLocalMutes();
    expect(useVoiceStore.getState().localMutedPubkeys).toEqual({});
  });

  it('leaveVoice wipes both transient sets', () => {
    const s = useVoiceStore.getState();
    s.setSpeaking('alice', true);
    s.muteLocally('alice');
    s.leaveVoice();
    expect(useVoiceStore.getState().speakingPubkeys).toEqual({});
    expect(useVoiceStore.getState().localMutedPubkeys).toEqual({});
  });
});

describe('voice store saved-data migrations', () => {
  const KEY = 'obelisk:voice:quality';
  const qualities = () => {
    const { videoQuality, receivedVideoQuality } = useVoiceStore.getState();
    return { videoQuality, receivedVideoQuality };
  };
  const load = (state: unknown, version: number) => {
    seedBlob(KEY, state, version);
    void useVoiceStore.persist.rehydrate();
  };

  beforeEach(() => localStorage.clear());

  it('a version 0 blob keeps both presets and is saved back under the current version', () => {
    load({ videoQuality: '720p', receivedVideoQuality: '480p' }, 0);
    expect(qualities()).toEqual({ videoQuality: '720p', receivedVideoQuality: '480p' });
    expect(readBlob(KEY)).toEqual({
      state: { videoQuality: '720p', receivedVideoQuality: '480p' },
      version: VOICE_STORE_VERSION,
    });
  });

  it('a preset this build does not know falls back to auto, and call state in the blob is ignored', () => {
    load({ videoQuality: '4k', receivedVideoQuality: '1080p', currentVoiceChannelId: 'stale', isMuted: false }, 0);
    expect(qualities()).toEqual({ videoQuality: 'auto', receivedVideoQuality: '1080p' });
    expect(useVoiceStore.getState().currentVoiceChannelId).toBeNull();
  });

  it.each(CORRUPT_STATES)('falls back to the defaults on %s', (_label, state, version) => {
    useVoiceStore.setState({ videoQuality: '720p', receivedVideoQuality: '720p' });
    expect(() => load(state, version)).not.toThrow();
    expect(qualities()).toEqual({ videoQuality: 'auto', receivedVideoQuality: 'auto' });
  });
});
