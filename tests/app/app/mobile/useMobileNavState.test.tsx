import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMobileNavState } from '@/app/app/mobile/useMobileNavState';

afterEach(() => { vi.restoreAllMocks(); });

describe('useMobileNavState', () => {
  it('pushNav moves nav, mirrors it into navRef and pushes one history entry with the relay', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useMobileNavState('wss://relay.example'));
    act(() => result.current.pushNav((n) => ({ ...n, screen: 'channel', groupId: 'g1' })));
    expect(result.current.nav.screen).toBe('channel');
    expect(result.current.navRef.current.groupId).toBe('g1');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][2]).toBe('/app?c=g1&relay=relay.example&s=channel');
  });

  it('records the slide direction, forward unless told otherwise', () => {
    const { result } = renderHook(() => useMobileNavState(null));
    act(() => result.current.pushNav((n) => ({ ...n, screen: 'feed' })));
    expect(result.current.slideDir).toBe('forward');
    act(() => result.current.pushNav((n) => ({ ...n, screen: 'server' }), 'back'));
    expect(result.current.slideDir).toBe('back');
  });
});
