import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useRelayAdminModals } from '@/hooks/shell/panes/sidebar/useRelayAdminModals';

describe('useRelayAdminModals', () => {
  it('opens and closes each editor on its own and reads the configured relays', () => {
    const { result } = renderHook(() => useRelayAdminModals(), {
      wrapper: bridgeWrapper(fakeBridge({ configuredRelays: ['wss://a.test'] })),
    });
    expect(result.current.configuredRelays).toEqual(['wss://a.test']);
    expect(Object.values(result.current.opened).some(Boolean)).toBe(false);
    act(() => result.current.open('branding'));
    act(() => result.current.open('roles'));
    expect(result.current.opened).toMatchObject({ branding: true, roles: true, layout: false });
    act(() => result.current.close('branding'));
    expect(result.current.opened).toMatchObject({ branding: false, roles: true });
  });
});
