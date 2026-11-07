import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
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
  it('includes sister-channel members while keeping current-channel roles', () => {
    const fake = fakeBridge({
      groups: [groupFixture({ id: 'g1' }), groupFixture({ id: 'g2' })],
      adminsByGroup: { g1: ['alice'], g2: ['bob'] },
      membersByGroup: { g1: ['alice'], g2: ['bob', 'carol'] },
    }, { ensureUserMetadata: async () => {} });
    const { result } = renderHook(() => useMemberList('g1'), { wrapper: bridgeWrapper(fake) });
    expect(result.current.offline.map((person) => person.pubkey).sort()).toEqual(['alice', 'bob', 'carol']);
    expect(result.current.offline.find((person) => person.pubkey === 'bob')?.role).toBe('member');
  });

});
