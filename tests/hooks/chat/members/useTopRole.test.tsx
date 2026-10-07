import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTopRole } from '@/hooks/chat/members/useTopRole';
import { useChatStore } from '@/store/chat';

const ALICE = 'a'.repeat(64);
const MOD = { id: 'mod', name: 'Moderator', tier: 3, color: '#ff0000', emoji: '🛡️' };
const OG = { id: 'og', name: 'OG', tier: 1, color: '#00ff00', emoji: '' };

describe('useTopRole', () => {
  beforeEach(() => useChatStore.setState(useChatStore.getInitialState()));

  it('returns the head of the store list, which is the most senior role', () => {
    useChatStore.getState().setRolesByPubkey({ [ALICE]: [MOD, OG] });
    const { result } = renderHook(() => useTopRole(ALICE));
    expect(result.current).toBe(MOD);
  });

  it('falls back to the next role when the top one is revoked', () => {
    useChatStore.getState().setRolesByPubkey({ [ALICE]: [MOD, OG] });
    const { result } = renderHook(() => useTopRole(ALICE));
    act(() => useChatStore.getState().setRolesByPubkey({ [ALICE]: [OG] }));
    expect(result.current).toBe(OG);
  });

  it('is null for a pubkey with no roles and for an empty list', () => {
    useChatStore.getState().setRolesByPubkey({ [ALICE]: [] });
    expect(renderHook(() => useTopRole(ALICE)).result.current).toBeNull();
    expect(renderHook(() => useTopRole('b'.repeat(64))).result.current).toBeNull();
  });
});
