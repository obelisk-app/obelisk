vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock();
});
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@tests/support/intl';

const putUser = vi.fn().mockResolvedValue(undefined);
const removePermission = vi.fn().mockResolvedValue(undefined);
const removeUser = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: {
      putUser: (...a: unknown[]) => putUser(...a),
      removePermission: (...a: unknown[]) => removePermission(...a),
      removeUser: (...a: unknown[]) => removeUser(...a),
    },
  });
});

import { useManageMemberRow } from '@/hooks/chat/members/useManageMemberRow';

afterEach(() => {
  putUser.mockReset().mockResolvedValue(undefined);
  removePermission.mockClear();
  removeUser.mockClear();
});

describe('useManageMemberRow', () => {
  it('asks before acting and can be cancelled without touching the relay', () => {
    const { result } = renderHook(() => useManageMemberRow('g', 'p'), { wrapper: LocaleProvider });
    expect(result.current.confirming).toBeNull();
    act(() => result.current.ask('remove'));
    expect(result.current.confirming).toBe('remove');
    act(() => result.current.cancel());
    expect(result.current.confirming).toBeNull();
    expect(removeUser).not.toHaveBeenCalled();
  });

  it('demote strips the admin permission and keeps the member', async () => {
    const { result } = renderHook(() => useManageMemberRow('g', 'p'), { wrapper: LocaleProvider });
    act(() => result.current.ask('demote'));
    await act(async () => { await result.current.confirmPending(); });
    expect(removePermission).toHaveBeenCalledWith('g', 'p', ['admin']);
    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.confirming).toBeNull();
  });

  it('remove kicks the member', async () => {
    const { result } = renderHook(() => useManageMemberRow('g', 'p'), { wrapper: LocaleProvider });
    act(() => result.current.ask('remove'));
    await act(async () => { await result.current.confirmPending(); });
    expect(removeUser).toHaveBeenCalledWith('g', 'p');
    expect(removePermission).not.toHaveBeenCalled();
  });

  it('confirm with nothing pending does nothing', async () => {
    const { result } = renderHook(() => useManageMemberRow('g', 'p'), { wrapper: LocaleProvider });
    await act(async () => { await result.current.confirmPending(); });
    expect(removeUser).not.toHaveBeenCalled();
    expect(removePermission).not.toHaveBeenCalled();
  });
  it('promotes only after confirmation and serializes repeated confirmation', async () => {
    let done!: () => void;
    putUser.mockImplementationOnce(() => new Promise<void>((resolve) => { done = resolve; }));
    const { result } = renderHook(() => useManageMemberRow('g', 'p'), { wrapper: LocaleProvider });
    act(() => result.current.ask('promote'));
    expect(putUser).not.toHaveBeenCalled();
    let pending!: Promise<void>;
    act(() => { pending = result.current.confirmPending(); void result.current.confirmPending(); });
    expect(putUser).toHaveBeenCalledExactlyOnceWith('g', 'p', ['admin']);
    expect(result.current.busy).toBe(true);
    act(() => result.current.ask('remove'));
    expect(result.current.confirming).toBeNull();
    await act(async () => { done(); await pending; });
    expect(result.current.busy).toBe(false);
  });

  it('shows a relay rejection without changing the member role and allows retry', async () => {
    putUser.mockRejectedValueOnce(new Error('rejected'));
    const { result } = renderHook(() => useManageMemberRow('g', 'p'), { wrapper: LocaleProvider });
    act(() => result.current.ask('promote'));
    await act(async () => { await result.current.confirmPending(); });
    expect(result.current.error).toBeTruthy();
    expect(result.current.busy).toBe(false);
    act(() => result.current.ask('promote'));
    await act(async () => { await result.current.confirmPending(); });
    expect(result.current.error).toBeNull();
    expect(putUser).toHaveBeenCalledTimes(2);
  });

});
