import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useAddRelaySheet } from '@/hooks/shell/mobile/sheets/relay/useAddRelaySheet';

describe('useAddRelaySheet', () => {
  it('opens on the suggestions and knows which relays are in the rail', () => {
    const { result } = renderHook(() => useAddRelaySheet(), { wrapper: bridgeWrapper(fakeBridge({ configuredRelays: ['wss://a'] })) });
    expect(result.current.tab).toBe('suggested');
    expect(result.current.isConfigured('wss://a')).toBe(true);
    expect(result.current.isConfigured('wss://b')).toBe(false);
    act(() => result.current.setTab('custom'));
    expect(result.current.tab).toBe('custom');
  });
});
