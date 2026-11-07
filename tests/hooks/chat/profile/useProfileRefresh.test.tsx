import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProfileRefresh } from '@/hooks/chat/profile/useProfileRefresh';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { PROFILE_OPEN_REFRESH_MS } from '@/constants/nostr-bridge/profile';
afterEach(() => vi.useRealTimers());
describe('opened profile revalidation', () => {
  it('refreshes on open and focus, throttles remounts, and cleans up its listener', async () => {
    vi.useFakeTimers();
    const refreshUserMetadata = vi.fn(async () => null);
    const bridge = fakeBridge({}, { refreshUserMetadata });
    const wrapper = bridgeWrapper(bridge);
    const first = renderHook(() => useProfileRefresh('d'.repeat(64)), { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(refreshUserMetadata).toHaveBeenCalledTimes(1);
    first.unmount();
    const second = renderHook(() => useProfileRefresh('d'.repeat(64)), { wrapper });
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(refreshUserMetadata).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(PROFILE_OPEN_REFRESH_MS);
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(refreshUserMetadata).toHaveBeenCalledTimes(2);
    second.unmount();
    await act(async () => {
      vi.advanceTimersByTime(PROFILE_OPEN_REFRESH_MS);
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(refreshUserMetadata).toHaveBeenCalledTimes(2);
  });
});
