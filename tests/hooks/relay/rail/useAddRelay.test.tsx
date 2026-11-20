import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useAddRelay } from '@/hooks/relay/rail/useAddRelay';

describe('useAddRelay', () => {
  it('starts in join mode and switches to creation and back', () => {
    const { result } = renderHook(() => useAddRelay(), { wrapper: bridgeWrapper(fakeBridge({ configuredRelays: ['wss://a'] })) });
    expect(result.current.creating).toBe(false);
    expect(result.current.isConfigured('wss://a')).toBe(true);
    expect(result.current.isConfigured('wss://b')).toBe(false);
    act(() => result.current.openCreate());
    expect(result.current.creating).toBe(true);
    act(() => result.current.backToJoin());
    expect(result.current.creating).toBe(false);
  });
});
