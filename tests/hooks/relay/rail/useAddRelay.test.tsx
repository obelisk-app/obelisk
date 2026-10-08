import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useAddRelay } from '@/hooks/relay/rail/useAddRelay';

describe('useAddRelay', () => {
  it('opens on the suggestions and knows which relays are in the rail', () => {
    const { result } = renderHook(() => useAddRelay(), { wrapper: bridgeWrapper(fakeBridge({ configuredRelays: ['wss://a'] })) });
    expect(result.current.tab).toBe('suggested');
    expect(result.current.isConfigured('wss://a')).toBe(true);
    expect(result.current.isConfigured('wss://b')).toBe(false);
    act(() => result.current.setTab('custom'));
    expect(result.current.tab).toBe('custom');
  });
});
