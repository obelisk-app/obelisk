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

  it('leaveVoice resets per-peer quality', () => {
    useVoiceStore.getState().setPeerQuality('abc', {
      level: 'fair', rttMs: null, loss: null, jitterMs: null,
      outboundVideoBps: null, outboundFps: null, qualityLimitationReason: null,
    });
    useVoiceStore.getState().leaveVoice();
    expect(useVoiceStore.getState().peerQuality).toEqual({});
  });
});
