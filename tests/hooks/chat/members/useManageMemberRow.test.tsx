vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock();
});
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const removePermission = vi.fn().mockResolvedValue(undefined);
const removeUser = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: {
      removePermission: (...a: unknown[]) => removePermission(...a),
      removeUser: (...a: unknown[]) => removeUser(...a),
    },
  });
});

import { useManageMemberRow } from '@/hooks/chat/members/useManageMemberRow';

afterEach(() => {
  removePermission.mockClear();
  removeUser.mockClear();
});

describe('useManageMemberRow', () => {
  it('asks before acting and can be cancelled without touching the relay', () => {
    const { result } = renderHook(() => useManageMemberRow('g', 'p'));
    expect(result.current.confirming).toBeNull();
    act(() => result.current.ask('remove'));
    expect(result.current.confirming).toBe('remove');
    act(() => result.current.cancel());
    expect(result.current.confirming).toBeNull();
    expect(removeUser).not.toHaveBeenCalled();
  });

  it('demote strips the admin permission and keeps the member', () => {
    const { result } = renderHook(() => useManageMemberRow('g', 'p'));
    act(() => result.current.ask('demote'));
    act(() => result.current.confirmPending());
    expect(removePermission).toHaveBeenCalledWith('g', 'p', ['admin']);
    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.confirming).toBeNull();
  });

  it('remove kicks the member', () => {
    const { result } = renderHook(() => useManageMemberRow('g', 'p'));
    act(() => result.current.ask('remove'));
    act(() => result.current.confirmPending());
    expect(removeUser).toHaveBeenCalledWith('g', 'p');
    expect(removePermission).not.toHaveBeenCalled();
  });

  it('confirm with nothing pending does nothing', () => {
    const { result } = renderHook(() => useManageMemberRow('g', 'p'));
    act(() => result.current.confirmPending());
    expect(removeUser).not.toHaveBeenCalled();
    expect(removePermission).not.toHaveBeenCalled();
  });
});
