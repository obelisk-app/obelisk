import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDmCallButtons } from '@/hooks/call/useDmCallButtons';
import { useDmCallStore } from '@/store/call/dm-call';
import { setPreference } from '@/services/preferences/preferences';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';

const BOB = 'b'.repeat(64);
const startCall = vi.fn(async () => {});
const render = () => renderHook(() => useDmCallButtons(BOB), { wrapper: bridgeWrapper(fakeBridge()) });

beforeEach(() => {
  setPreference('directMessagesEnabled', true);
  useDmCallStore.setState({ status: 'idle', startCall });
});
afterEach(() => { vi.clearAllMocks(); });

describe('useDmCallButtons', () => {
  it('starts a voice or a video call with the peer', () => {
    const { result } = render();
    expect(result.current.disabled).toBe(false);
    result.current.startVoice();
    expect(startCall).toHaveBeenLastCalledWith(BOB, false);
    result.current.startVideo();
    expect(startCall).toHaveBeenLastCalledWith(BOB, true);
  });

  it('is disabled during a call, and says calls need DMs when they are off', () => {
    const { result } = render();
    act(() => { useDmCallStore.setState({ status: 'active' }); });
    expect(result.current.disabled).toBe(true);
    expect(result.current.titleFor('Voice call')).toBe('Voice call');
    act(() => { useDmCallStore.setState({ status: 'idle' }); setPreference('directMessagesEnabled', false); });
    expect(result.current.disabled).toBe(true);
    expect(result.current.titleFor('Voice call')).not.toBe('Voice call');
  });
});
