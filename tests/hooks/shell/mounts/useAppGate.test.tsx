import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const initSocial = vi.fn();
vi.mock('@/services/social/pool', () => ({ initSocial: (relays: string[]) => initSocial(relays) }));

import { useAppGate } from '@/hooks/shell/mounts/useAppGate';
import { getPreferences } from '@/services/preferences/preferences';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

function stubViewport(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

describe('useAppGate', () => {
  beforeEach(() => {
    initSocial.mockClear();
  });

  it('reports the phone viewport once matchMedia has answered, and the session', async () => {
    stubViewport(true);
    const { result } = renderHook(() => useAppGate(), { wrapper: bridgeWrapper(fakeBridge({ isLoggedIn: true })) });
    await waitFor(() => expect(result.current.isMobile).toBe(true));
    expect(result.current.loggedIn).toBe(true);
  });

  it('reports a desktop viewport and a signed-out session', async () => {
    stubViewport(false);
    const { result } = renderHook(() => useAppGate(), { wrapper: bridgeWrapper(fakeBridge({ isLoggedIn: false })) });
    await waitFor(() => expect(result.current.isMobile).toBe(false));
    expect(result.current.loggedIn).toBe(false);
  });

  it('points the social SDK at the configured social relays', () => {
    stubViewport(false);
    renderHook(() => useAppGate(), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(initSocial).toHaveBeenCalledWith(getPreferences().socialRelays);
  });
});
