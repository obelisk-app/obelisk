import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useVoiceStatusBar } from '@/hooks/voice/status-bar/useVoiceStatusBar';
import { useVoiceStore } from '@/store/voice';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';

const jump = vi.hoisted(() => vi.fn());
vi.mock('@/services/voice/jump-to-voice', () => ({ requestVoiceJump: jump }));

const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
const prevDevices = nav.mediaDevices;

const render = () => renderHook(() => useVoiceStatusBar(), {
  wrapper: bridgeWrapper(fakeBridge({ groups: [groupFixture({ id: 'ch1', name: 'Lounge' })] })),
});

beforeEach(() => {
  jump.mockClear();
  nav.mediaDevices = { enumerateDevices: async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }] };
  useVoiceStore.setState({ currentVoiceChannelId: 'ch1', currentVoiceRelayUrl: null, isCameraOn: false });
});
afterEach(() => {
  nav.mediaDevices = prevDevices;
  useVoiceStore.getState().leaveVoice();
});

describe('useVoiceStatusBar', () => {
  it('labels the call with its channel name, or a short id for an unknown channel', () => {
    const { result } = render();
    expect(result.current.channelLabel).toBe('Lounge');
    act(() => { useVoiceStore.setState({ currentVoiceChannelId: 'abcdef0123456789' }); });
    expect(result.current.channelLabel).toBe('abcdef01…');
  });

  it('has no channel and no label without a call', () => {
    useVoiceStore.setState({ currentVoiceChannelId: null });
    const { result } = render();
    expect(result.current.channelId).toBeNull();
    expect(result.current.channelLabel).toBe('');
  });

  it('offers the camera flip only with the camera on and two cameras', async () => {
    const { result } = render();
    await act(async () => {});
    expect(result.current.showSwitchCamera).toBe(false);
    act(() => { useVoiceStore.setState({ isCameraOn: true }); });
    await waitFor(() => expect(result.current.showSwitchCamera).toBe(true));
  });

  it('jumps back with the relay the call was joined on, or null', () => {
    const { result } = render();
    result.current.jump();
    expect(jump).toHaveBeenLastCalledWith({ channelId: 'ch1', relayUrl: null });
    act(() => { useVoiceStore.setState({ currentVoiceRelayUrl: 'wss://home.relay' }); });
    result.current.jump();
    expect(jump).toHaveBeenLastCalledWith({ channelId: 'ch1', relayUrl: 'wss://home.relay' });
  });

  it('does not jump without a call', () => {
    useVoiceStore.setState({ currentVoiceChannelId: null });
    const { result } = render();
    result.current.jump();
    expect(jump).not.toHaveBeenCalled();
  });
});
