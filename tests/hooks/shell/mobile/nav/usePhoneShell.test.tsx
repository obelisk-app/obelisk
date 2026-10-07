import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { usePhoneShell } from '@/hooks/shell/mobile/nav/usePhoneShell';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const run = (seed: Parameters<typeof fakeBridge>[0] = {}) =>
  renderHook(() => usePhoneShell(), { wrapper: bridgeWrapper(fakeBridge(seed, { setActiveGroup: vi.fn(), setActiveDmPeer: vi.fn() } as never)) });

describe('usePhoneShell', () => {
  it('reports a guest so the shell shows the login', () => {
    const { result } = run({ isLoggedIn: false });
    expect(result.current.isLoggedIn).toBe(false);
  });

  it('opens on the server tab with the nav shown and its hint surface', () => {
    const { result } = run();
    expect(result.current.nav.screen).toBe('server');
    expect(result.current.hideNav).toBe(false);
    expect(result.current.hintSurface).toBe('server');
    expect(result.current.kbStyle).toBeUndefined();
    expect(result.current.dmBadge).toBe(0);
  });

  it('hands every screen the shell actions and hides the nav on a full-screen one', () => {
    const { result } = run();
    act(() => result.current.screenProps.go('search'));
    expect(result.current.nav.screen).toBe('search');
    expect(result.current.hideNav).toBe(true);
    expect(result.current.hintSurface).toBeNull();
  });

  it('opens the channel chat from a voice room', () => {
    const { result } = run();
    act(() => result.current.screenProps.openVoiceChat());
    expect(result.current.nav.screen).toBe('channel');
  });
});
