import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAddRelayModal } from '@/hooks/shell/rail/useAddRelayModal';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

describe('useAddRelayModal', () => {
  it('opens on the suggestions, switches tabs, and knows what is already added', () => {
    const { result } = renderHook(() => useAddRelayModal(), { wrapper: bridgeWrapper(fakeBridge({ configuredRelays: ['wss://a'] })) });
    expect(result.current.tab).toBe('suggested');
    act(() => result.current.showCustom());
    expect(result.current.tab).toBe('custom');
    act(() => result.current.showSuggested());
    expect(result.current.tab).toBe('suggested');
    expect(result.current.isAdded('wss://a')).toBe(true);
    expect(result.current.isAdded('wss://b')).toBe(false);
  });
});
