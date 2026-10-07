import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const who = vi.hoisted(() => ({ pubkey: 'a'.repeat(64) as string | null, method: 'nip07' }));
vi.mock('@/services/nostr-bridge', () => ({
  useMyPubkey: () => who.pubkey,
  useMyLoginMethod: () => who.method,
}));
const selfPqState = vi.fn();
vi.mock('@/services/chat/pq/capability', () => ({ selfPqState: (...a: unknown[]) => selfPqState(...a) }));

import { usePostQuantumProbe } from '@/hooks/shell/settings/usePostQuantumProbe';

describe('usePostQuantumProbe', () => {
  it('reads as checking, then carries the answer for this account and signer', async () => {
    selfPqState.mockResolvedValueOnce({ canSend: true, hasKeys: true });
    const { result } = renderHook(() => usePostQuantumProbe());
    expect(result.current.state).toBeNull();
    await waitFor(() => expect(result.current.state).toEqual({ canSend: true, hasKeys: true }));
    expect(selfPqState).toHaveBeenCalledWith('a'.repeat(64), 'nip07');
  });

  it('goes back to checking when the login method changes', async () => {
    selfPqState.mockResolvedValueOnce({ canSend: true, hasKeys: true });
    const { result, rerender } = renderHook(() => usePostQuantumProbe());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    selfPqState.mockReturnValueOnce(new Promise(() => {}));
    who.method = 'nsec';
    rerender();
    expect(result.current.state).toBeNull();
    who.method = 'nip07';
  });

  it('does not ask without an account', () => {
    who.pubkey = null;
    selfPqState.mockClear();
    renderHook(() => usePostQuantumProbe());
    expect(selfPqState).not.toHaveBeenCalled();
    who.pubkey = 'a'.repeat(64);
  });
});
