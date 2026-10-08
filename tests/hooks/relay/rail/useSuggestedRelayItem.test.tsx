import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

vi.mock('@/services/relay/relay-info', () => ({
  faviconFor: (url: string) => `fav:${url}`,
  fetchRelayInfo: vi.fn(async (url: string) => (url.includes('full') ? { name: 'Full', description: 'About', icon: 'icon.png' } : {})),
}));

import { useSuggestedRelayItem } from '@/hooks/relay/rail/useSuggestedRelayItem';

const run = (url: string) => renderHook(() => useSuggestedRelayItem(url, false, vi.fn()), { wrapper: bridgeWrapper(fakeBridge()) });

describe('useSuggestedRelayItem', () => {
  it('adds through the shared bridge action and reports completion', async () => {
    const addRelay = vi.fn().mockResolvedValue(undefined);
    const onAdded = vi.fn();
    const { result } = renderHook(() => useSuggestedRelayItem('wss://added.test', false, onAdded), {
      wrapper: bridgeWrapper(fakeBridge({}, { addRelay })),
    });
    await act(async () => { await result.current.add(); });
    expect(addRelay).toHaveBeenCalledWith('wss://added.test');
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('shows the host and a letter until the document arrives, then its name, description and icon', async () => {
    const { result } = run('wss://full.test');
    expect(result.current).toMatchObject({ host: 'full.test', name: 'full.test', description: '', icon: null });
    await waitFor(() => expect(result.current.icon).toBe('icon.png'));
    expect(result.current).toMatchObject({ name: 'Full', description: 'About' });
  });

  it('uses the favicon when the document has no icon, and the letter once the image fails', async () => {
    const { result } = run('wss://bare.test');
    await waitFor(() => expect(result.current.icon).toBe('fav:wss://bare.test'));
    expect(result.current.name).toBe('bare.test');
    act(() => result.current.onIconError());
    expect(result.current.icon).toBeNull();
  });
});
