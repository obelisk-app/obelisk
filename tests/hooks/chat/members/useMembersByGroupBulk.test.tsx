import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

import { useMembersByGroupBulk } from '@/hooks/chat/members/useMembersByGroupBulk';

describe('useMembersByGroupBulk', () => {
  it('replays the current snapshot and follows later updates', () => {
    const bridge = fakeBridge({ membersByGroup: { g1: ['a', 'b'] } });
    const { result } = renderHook(() => useMembersByGroupBulk(), { wrapper: bridgeWrapper(bridge) });
    expect(result.current).toEqual({ g1: ['a', 'b'] });
    act(() => bridge.stores.membersByGroup.set({ g1: ['a', 'b'], g2: ['c'] }));
    expect(result.current).toEqual({ g1: ['a', 'b'], g2: ['c'] });
  });

  it('unsubscribes on unmount', () => {
    const bridge = fakeBridge({ membersByGroup: { g1: ['a', 'b'] } });
    const { result, unmount } = renderHook(() => useMembersByGroupBulk(), { wrapper: bridgeWrapper(bridge) });
    unmount();
    const before = result.current;
    act(() => bridge.stores.membersByGroup.set({ g1: [] }));
    expect(result.current).toBe(before);
  });

  it('stays empty when there is no bridge yet', () => {
    const { result } = renderHook(() => useMembersByGroupBulk());
    expect(result.current).toEqual({});
  });
});
