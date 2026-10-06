/**
 * The seam between the voice engine and the UI store. Two contracts:
 *
 *  1. The production sink really reaches the store (so removing the old
 *     `useVoiceStore.getState()` calls from the client lost nothing).
 *  2. A sink error is NOT swallowed by the client. The sixteen `catch`
 *     blocks commented "test envs" that this replaces hid every store
 *     exception; the client must now let it surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWebRtcMocks, installMediaDevicesMocks } from '@tests/support/mocks/webrtc';
import { useVoiceStore } from '@/store/voice';
import { silentVoiceUiSink, voiceStoreSink, type VoiceUiSink } from '@/services/voice/ui-sink';

vi.mock('@/services/voice/transport', async (importOriginal) => {
  const noop = async () => {};
  const unsub = async () => () => {};
  return {
    publishPresenceBeacon: noop,
    publishLeavePresence: noop,
    subscribeRoster: unsub,
    sendSignal: noop,
    subscribeSignals: unsub,
    createVoiceTransport: () => ({
      publishPresenceBeacon: noop,
      publishLeavePresence: noop,
      subscribeRoster: unsub,
      sendSignal: noop,
      subscribeSignals: unsub,
    }),
    getSelfPubkey: () => 'a'.repeat(64),
    transitiveParticipants: (await importOriginal<typeof import('@/services/voice/transport')>()).transitiveParticipants,
  };
});
vi.mock('@/services/voice/sfu-control', () => ({ pickSfu: async () => null, publishSfuStart: async () => true }));
vi.mock('@/services/nostr-bridge/client', () => ({
  getBridge: async () => ({
    subscribeActiveCallByChannel: () => () => {},
    waitForRelayAuth: async () => 'ok',
    reserveVoiceRelayCapacity: () => () => {},
  }),
}));

import { VoiceClient } from '@/services/voice/client';

const SELF = 'a'.repeat(64);
const PEER = 'b'.repeat(64);

let webrtc: ReturnType<typeof installWebRtcMocks>;
let media: ReturnType<typeof installMediaDevicesMocks>;

beforeEach(() => {
  webrtc = installWebRtcMocks();
  media = installMediaDevicesMocks();
  useVoiceStore.getState().leaveVoice();
});
afterEach(() => {
  webrtc.uninstall();
  media.uninstall();
});

describe('voiceStoreSink', () => {
  it('writes every operation through to the voice store', () => {
    voiceStoreSink.setSignalingDegraded(true);
    voiceStoreSink.setSpeaking(PEER, true);
    voiceStoreSink.setPeerMuted(PEER, true);
    voiceStoreSink.setPeerQuality(PEER, {
      level: 'good', rttMs: 50, loss: 0, jitterMs: 5, outboundVideoBps: null, outboundFps: null, qualityLimitationReason: null,
    });
    voiceStoreSink.setError('boom');
    voiceStoreSink.setLocalTracks({ mic: true, camera: true, screen: false });
    const s = useVoiceStore.getState();
    expect(s.isSignalingDegraded).toBe(true);
    expect(s.speakingPubkeys[PEER]).toBe(true);
    expect(s.localMutedPubkeys[PEER]).toBe(true);
    expect(s.peerQuality[PEER]?.level).toBe('good');
    expect(s.error).toBe('boom');
    expect(s.isMuted).toBe(false);
    expect(s.isCameraOn).toBe(true);
    expect(s.isScreenSharing).toBe(false);

    voiceStoreSink.setPeerMuted(PEER, false);
    voiceStoreSink.clearPeerQuality(PEER);
    voiceStoreSink.setSpeaking(PEER, false);
    voiceStoreSink.setSignalingDegraded(false);
    const after = useVoiceStore.getState();
    expect(after.localMutedPubkeys[PEER]).toBeUndefined();
    expect(after.peerQuality[PEER]).toBeUndefined();
    expect(after.speakingPubkeys[PEER]).toBeUndefined();
    expect(after.isSignalingDegraded).toBe(false);
  });

  it('reads the persisted quality preferences', () => {
    useVoiceStore.getState().setVideoQuality('720p');
    useVoiceStore.getState().setReceivedVideoQuality('480p');
    expect(voiceStoreSink.readVideoQuality()).toEqual({ videoQuality: '720p', receivedVideoQuality: '480p' });
    useVoiceStore.getState().setVideoQuality('auto');
    useVoiceStore.getState().setReceivedVideoQuality('auto');
  });
});

describe('VoiceClient and its ui sink', () => {
  it('uses the store sink by default, so a muted peer lands in the store', () => {
    const client = new VoiceClient('ch1', { members: [SELF] });
    client.setPeerMuted(PEER, true);
    expect(useVoiceStore.getState().localMutedPubkeys[PEER]).toBe(true);
    client.setPeerMuted(PEER, false);
    expect(useVoiceStore.getState().localMutedPubkeys[PEER]).toBeUndefined();
  });

  it('routes every UI write through an injected sink and never touches the store', async () => {
    const sink = silentVoiceUiSink();
    const spy = {
      setPeerMuted: vi.spyOn(sink, 'setPeerMuted'),
      setLocalTracks: vi.spyOn(sink, 'setLocalTracks'),
      clearLocalMutes: vi.spyOn(sink, 'clearLocalMutes'),
      setSignalingDegraded: vi.spyOn(sink, 'setSignalingDegraded'),
    };
    const client = new VoiceClient('ch1', { members: [SELF], uiSink: sink });
    client.setPeerMuted(PEER, true);
    await client.join();
    await client.setMicEnabled(true);
    await client.leave();
    expect(spy.setPeerMuted).toHaveBeenCalledWith(PEER, true);
    expect(spy.setLocalTracks).toHaveBeenCalledWith({ mic: true, camera: false, screen: false });
    expect(spy.setLocalTracks).toHaveBeenLastCalledWith({ mic: false, camera: false, screen: false });
    expect(spy.clearLocalMutes).toHaveBeenCalledTimes(1);
    expect(spy.setSignalingDegraded).not.toHaveBeenCalled();
    // The store never saw any of it.
    expect(useVoiceStore.getState().localMutedPubkeys[PEER]).toBeUndefined();
    expect(useVoiceStore.getState().isMuted).toBe(true);
  });

  it('does not swallow a sink that throws', () => {
    const sink: VoiceUiSink = {
      ...silentVoiceUiSink(),
      setPeerMuted: () => { throw new Error('store subscriber exploded'); },
    };
    const client = new VoiceClient('ch1', { members: [SELF], uiSink: sink });
    expect(() => client.setPeerMuted(PEER, true)).toThrow('store subscriber exploded');
  });
});
