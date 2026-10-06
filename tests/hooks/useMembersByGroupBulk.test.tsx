import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StateStore } from '@/services/nostr-bridge/state-store';

const membersByGroup = new StateStore<Record<string, string[]>>({ g1: ['a', 'b'] });
let impl: { membersByGroup: StateStore<Record<string, string[]>> } | null = { membersByGroup };

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ getBridgeImpl: () => impl });
});

import { useMembersByGroupBulk } from '@/hooks/useMembersByGroupBulk';

describe('useMembersByGroupBulk', () => {
  it('replays the current snapshot and follows later updates', () => {
    const { result } = renderHook(() => useMembersByGroupBulk());
    expect(result.current).toEqual({ g1: ['a', 'b'] });
    act(() => membersByGroup.set({ g1: ['a', 'b'], g2: ['c'] }));
    expect(result.current).toEqual({ g1: ['a', 'b'], g2: ['c'] });
  });

  it('unsubscribes on unmount', () => {
    const { result, unmount } = renderHook(() => useMembersByGroupBulk());
    unmount();
    const before = result.current;
    act(() => membersByGroup.set({ g1: [] }));
    expect(result.current).toBe(before);
  });

  it('stays empty when there is no bridge yet', () => {
    impl = null;
    const { result } = renderHook(() => useMembersByGroupBulk());
    expect(result.current).toEqual({});
    impl = { membersByGroup };
  });
});
