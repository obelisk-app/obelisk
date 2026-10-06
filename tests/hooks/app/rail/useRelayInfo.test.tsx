import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const fetchRelayInfo = vi.fn();
vi.mock('@/services/relay-info', () => ({ fetchRelayInfo: (u: string) => fetchRelayInfo(u) }));

import { useRelayInfo } from '@/hooks/app/rail/useRelayInfo';

describe('useRelayInfo', () => {
  it('is unloaded until the fetch settles, then carries the document', async () => {
    fetchRelayInfo.mockResolvedValueOnce({ name: 'A', icon: 'https://a/icon.png' });
    const { result } = renderHook(() => useRelayInfo('wss://a.example'));
    expect(result.current).toEqual({ info: null, loaded: false });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.info?.name).toBe('A');
  });

  it('a new url starts unloaded rather than showing the old relay\'s document', async () => {
    fetchRelayInfo.mockResolvedValueOnce({ name: 'A' });
    const { result, rerender } = renderHook(({ url }) => useRelayInfo(url), { initialProps: { url: 'wss://a.example' } });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchRelayInfo.mockReturnValueOnce(new Promise(() => {}));
    rerender({ url: 'wss://b.example' });
    expect(result.current).toEqual({ info: null, loaded: false });
  });
});
