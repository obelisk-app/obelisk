import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useSettingsPrefsScreen } from '@/hooks/shell/mobile/screens/settings/useSettingsPrefsScreen';

describe('useSettingsPrefsScreen', () => {
  it('opens and closes a sub-screen', () => {
    const { result } = renderHook(() => useSettingsPrefsScreen(), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.view).toBe('main');
    act(() => result.current.openView('data'));
    expect(result.current.view).toBe('data');
    act(() => result.current.closeView());
    expect(result.current.view).toBe('main');
  });

  it('closes the confirmation and logs out on confirm', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSettingsPrefsScreen(), { wrapper: bridgeWrapper(fakeBridge({}, { logout } as never)) });
    act(() => result.current.askLogout());
    expect(result.current.confirmingLogout).toBe(true);
    act(() => result.current.confirmLogout());
    expect(result.current.confirmingLogout).toBe(false);
    await vi.waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it('flips the DM opt-in', () => {
    const { result } = renderHook(() => useSettingsPrefsScreen(), {
      wrapper: bridgeWrapper(fakeBridge({}, { disableDirectMessages: vi.fn() } as never)),
    });
    const before = result.current.dmOptInEnabled;
    act(() => result.current.toggleDms());
    expect(result.current.dmOptInEnabled).toBe(!before);
    act(() => result.current.toggleDms());
  });
});
