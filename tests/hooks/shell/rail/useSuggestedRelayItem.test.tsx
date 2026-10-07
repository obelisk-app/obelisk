import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/relay/relay-info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/relay/relay-info')>()),
  fetchRelayInfo: vi.fn(async (url: string) => (url === 'wss://named.example' ? { name: 'Named', description: 'About it' } : null)),
}));

import { useSuggestedRelayItem } from '@/hooks/shell/rail/useSuggestedRelayItem';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

function setup(url: string, alreadyAdded = false, methods: Record<string, unknown> = {}) {
  const onAdded = vi.fn();
  const view = renderHook(() => useSuggestedRelayItem(url, alreadyAdded, onAdded), { wrapper: bridgeWrapper(fakeBridge({}, methods)) });
  return { ...view, onAdded };
}

describe('useSuggestedRelayItem', () => {
  it('names the relay from NIP-11 once it answers', async () => {
    const { result } = setup('wss://named.example');
    await waitFor(() => expect(result.current.name).toBe('Named'));
    expect(result.current.description).toBe('About it');
  });

  it('falls back to the host, "No description" and the favicon, then the letters', async () => {
    const { result } = setup('wss://plain.example');
    expect(result.current.name).toBe('plain.example');
    expect(result.current.description).toBe('No description');
    expect(result.current.icon).toBe('https://plain.example/favicon.ico');
    act(() => result.current.onIconError());
    expect(result.current.icon).toBeNull();
    expect(result.current.initials).not.toBe('');
  });

  it('labels the button by state and adds through the bridge', async () => {
    const addRelay = vi.fn().mockResolvedValue(undefined);
    const { result, onAdded } = setup('wss://plain.example', false, { addRelay });
    expect(result.current.buttonLabel).toBe('Add');
    await act(async () => { result.current.add(); });
    expect(addRelay).toHaveBeenCalledWith('wss://plain.example');
    expect(onAdded).toHaveBeenCalled();
    expect(setup('wss://plain.example', true).result.current.buttonLabel).toBe('Added');
  });
});
