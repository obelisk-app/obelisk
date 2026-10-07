import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '@/store/feedback/toast';
import { useSessionNoticeToast } from '@/hooks/shell/login/useSessionNoticeToast';
import { fakeBridge, type FakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

let bridge: FakeBridge;

beforeEach(() => {
  bridge = fakeBridge({ sessionNotice: null });
  useToastStore.getState().clearToasts();
});

describe('useSessionNoticeToast', () => {
  it('tells the person once that this login is for this visit only', () => {
    const { rerender } = renderHook(() => useSessionNoticeToast(), { wrapper: bridgeWrapper(bridge) });
    expect(useToastStore.getState().toasts).toHaveLength(0);

    act(() => bridge.stores.sessionNotice.set('not-remembered'));
    rerender();
    rerender();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('Logged in for this visit only');
    expect(toasts[0].body).toMatch(/log in again next time/);
  });

  it('says nothing for the restore failures, which the login screen explains', () => {
    renderHook(() => useSessionNoticeToast(), { wrapper: bridgeWrapper(bridge) });
    for (const code of ['vault-unavailable', 'key-missing', 'unlock-failed'] as const) {
      act(() => bridge.stores.sessionNotice.set(code));
    }
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
