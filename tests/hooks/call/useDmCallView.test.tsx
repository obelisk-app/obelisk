import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { callStatusKey, useDmCallView } from '@/hooks/call/useDmCallView';
import { useIncomingCallBanner } from '@/hooks/call/useIncomingCallBanner';
import { useDmCallStore } from '@/store/call/dm-call';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';

const BOB = 'b'.repeat(64);
const media = { micOn: true, cameraOn: false, screenOn: false, localVideo: null, localScreen: null, remoteAudio: null, remoteVideo: null, remoteScreen: null };
const wrapper = () => bridgeWrapper(fakeBridge({ userMetadata: { [BOB]: userMetadataFixture({ pubkey: BOB, name: 'Bob' }) } }));
const actions = { acceptCall: vi.fn(async () => {}), declineCall: vi.fn() };

beforeEach(() => {
  useDmCallStore.setState({ status: 'outgoing', peer: BOB, video: false, relayOnly: false, media, connectedAt: null, endReason: null, error: null, ...actions });
});
afterEach(() => { vi.clearAllMocks(); });

describe('callStatusKey', () => {
  it('names the set-up stages and nothing once the call is up', () => {
    expect(callStatusKey('outgoing')).toBe('calls.call.calling');
    expect(callStatusKey('connecting')).toBe('calls.call.connecting');
    expect(callStatusKey('reconnecting')).toBe('calls.call.reconnecting');
    expect(callStatusKey('active')).toBeNull();
  });
});

describe('useDmCallView', () => {
  it('names the peer and reads the status line and the end reason', () => {
    const { result } = renderHook(() => useDmCallView(), { wrapper: wrapper() });
    expect(result.current.name).toBe('Bob');
    expect(result.current.lineKey).toBe('calls.call.calling');
    expect(result.current.ended).toBe(false);
    expect(result.current.showRemoteVideo).toBe(false);
    act(() => { useDmCallStore.setState({ status: 'ended', endReason: null }); });
    expect(result.current.ended).toBe(true);
    expect(result.current.endedKey).toBe('calls.call.ended.local-hangup');
    act(() => { useDmCallStore.setState({ endReason: 'declined' }); });
    expect(result.current.endedKey).toBe('calls.call.ended.declined');
  });
});

describe('useIncomingCallBanner', () => {
  it('names the caller and answers with or without video, or declines', () => {
    useDmCallStore.setState({ status: 'incoming', video: true });
    const { result } = renderHook(() => useIncomingCallBanner(), { wrapper: wrapper() });
    expect(result.current).toMatchObject({ peer: BOB, video: true, name: 'Bob' });
    result.current.acceptVideo();
    expect(actions.acceptCall).toHaveBeenLastCalledWith(true);
    result.current.acceptVoice();
    expect(actions.acceptCall).toHaveBeenLastCalledWith(false);
    result.current.decline();
    expect(actions.declineCall).toHaveBeenCalled();
  });
});
