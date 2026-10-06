import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const fetchRelayInfo = vi.fn();
vi.mock('@/services/relay-info', () => ({
  fetchRelayInfo: (u: string) => fetchRelayInfo(u),
  faviconFor: (u: string) => `${u}/favicon.ico`,
}));

import { useRelayHeaderInfo } from '@/hooks/app/useRelayHeaderInfo';

describe('useRelayHeaderInfo', () => {
  it('uses the NIP-11 icon, else the favicon, and drops it once it fails to load', async () => {
    fetchRelayInfo.mockResolvedValueOnce({ name: 'Relay A' });
    const { result } = renderHook(() => useRelayHeaderInfo('wss://a.example'));
    await waitFor(() => expect(result.current.name).toBe('Relay A'));
    expect(result.current.icon).toBe('wss://a.example/favicon.ico');
    act(() => result.current.onIconError());
    expect(result.current.icon).toBeUndefined();
  });

  it('keeps the previous relay showing until the next one answers, and retries the new icon', async () => {
    fetchRelayInfo.mockResolvedValueOnce({ name: 'Relay A', icon: 'https://a/icon.png' });
    const { result, rerender } = renderHook(({ relay }) => useRelayHeaderInfo(relay), {
      initialProps: { relay: 'wss://a.example' },
    });
    await waitFor(() => expect(result.current.name).toBe('Relay A'));
    act(() => result.current.onIconError());

    let answer: (info: { name: string }) => void = () => {};
    fetchRelayInfo.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    rerender({ relay: 'wss://b.example' });
    expect(result.current.name).toBe('Relay A');
    await act(async () => answer({ name: 'Relay B' }));
    expect(result.current.name).toBe('Relay B');
    expect(result.current.icon).toBe('wss://b.example/favicon.ico');
  });

  it('knows nothing and fetches nothing without a relay', () => {
    fetchRelayInfo.mockClear();
    const { result } = renderHook(() => useRelayHeaderInfo(null));
    expect(result.current.name).toBeUndefined();
    expect(result.current.icon).toBeUndefined();
    expect(fetchRelayInfo).not.toHaveBeenCalled();
  });
});
