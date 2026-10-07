import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { useMemberList } from '@/hooks/chat/members/useMemberList';

describe('useMemberList', () => {
  it('starts with nobody and the offline list open, and toggles it', () => {
    const { result } = renderHook(() => useMemberList('g1'), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.onlineGroups).toEqual([]);
    expect(result.current.offline).toEqual([]);
    expect(result.current.offlineCollapsed).toBe(false);
    act(() => result.current.toggleOffline());
    expect(result.current.offlineCollapsed).toBe(true);
  });
});
