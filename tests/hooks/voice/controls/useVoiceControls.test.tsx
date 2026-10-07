import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useVoiceControls } from '@/hooks/voice/controls/useVoiceControls';
import { setActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient } from '@/services/voice/client';
import { useVoiceStore } from '@/store/voice';

const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
const prevDevices = nav.mediaDevices;

beforeEach(() => {
  nav.mediaDevices = { enumerateDevices: async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }] };
  useVoiceStore.setState({ isMuted: false, isDeafened: false, isCameraOn: false, error: null });
});
afterEach(() => {
  nav.mediaDevices = prevDevices;
  setActiveVoiceClient(null);
  vi.restoreAllMocks();
});

describe('useVoiceControls', () => {
  it('offers the camera flip only with the camera on and two cameras', async () => {
    const { result } = renderHook(() => useVoiceControls());
    await act(async () => {});
    expect(result.current.showSwitchCamera).toBe(false);
    act(() => { useVoiceStore.setState({ isCameraOn: true }); });
    await waitFor(() => expect(result.current.showSwitchCamera).toBe(true));
  });

  it('reads the error from the store', () => {
    const { result } = renderHook(() => useVoiceControls());
    act(() => { useVoiceStore.setState({ error: 'cameraLimit' }); });
    expect(result.current.error).toBe('cameraLimit');
  });

  it('deafens and reports a mic that will not stop instead of rejecting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = {
      setDeafenEnabled: vi.fn(),
      setMicEnabled: vi.fn(async () => { throw new Error('stuck'); }),
    };
    setActiveVoiceClient(client as unknown as VoiceClient);
    const { result } = renderHook(() => useVoiceControls());
    act(() => { result.current.toggleDeafen(); });
    expect(client.setDeafenEnabled).toHaveBeenCalledWith(true);
    await waitFor(() => expect(warn).toHaveBeenCalledWith('[voice] mic did not stop on deafen', expect.any(Error)));
    expect(useVoiceStore.getState().isDeafened).toBe(true);
  });
});
