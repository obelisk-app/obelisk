import { describe, it, expect, beforeEach } from 'vitest';
import { useVoiceStore } from './voice';

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
