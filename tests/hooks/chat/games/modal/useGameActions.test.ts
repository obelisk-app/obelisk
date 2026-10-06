import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishMove = vi.hoisted(() => vi.fn());
vi.mock('@/services/games/transport', () => ({ publishMove }));

import { useGameActions } from '@/hooks/chat/games/modal/useGameActions';
import type { GameSession } from '@/lib/games/session';

const SESSION = { channelId: 'c1', id: 'g1', turnIndex: 3 } as unknown as GameSession;

beforeEach(() => publishMove.mockReset());

describe('useGameActions', () => {
  it('publishes a move for the named seat at the current turn', async () => {
    publishMove.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGameActions(SESSION));
    await act(() => result.current.onAction({ cell: 4 }, 'seat-a'));
    expect(publishMove).toHaveBeenCalledWith('c1', 'g1', 3, { cell: 4 }, 'seat-a');
    expect(result.current.busy).toBe(false);
  });

  it('shows the relay error and clears it on the next try', async () => {
    publishMove.mockRejectedValueOnce(new Error('blocked: not a member'));
    const { result } = renderHook(() => useGameActions(SESSION));
    await act(() => result.current.onAction({ cell: 0 }, 'seat-a'));
    expect(result.current.error).toBe('blocked: not a member');
    publishMove.mockResolvedValueOnce(undefined);
    await act(() => result.current.onAction({ cell: 1 }, 'seat-a'));
    expect(result.current.error).toBeNull();
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    const { result } = renderHook(() => useGameActions(SESSION));
    await act(() => result.current.run(() => Promise.reject('nope')));
    expect(result.current.error).toBe('Relay rejected that');
  });

  it('does nothing without a session', async () => {
    const { result } = renderHook(() => useGameActions(null));
    await act(() => result.current.onAction({ cell: 0 }, 'seat-a'));
    expect(publishMove).not.toHaveBeenCalled();
  });
});
